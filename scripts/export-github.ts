import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { Item } from "../src/types.js";
import { deriveGithubAction, type GithubNotificationFacts } from "../src/tools/github.js";

/**
 * Export the GitHub notification inbox to data/private/github.jsonl in the Item schema.
 *
 * Ground truth comes from what the inbox already recorded (see src/tools/github.ts):
 * a comment by the user after the notification, a done mark, an unsubscribe, or nothing at all.
 * Raw signals live under meta so the eval harness can audit them; src/agent/predict.ts strips
 * them before the agent sees the item.
 *
 * Requires the gh CLI, authenticated with the notifications scope:
 *   gh auth refresh -s notifications
 *   npx tsx scripts/export-github.ts
 *
 * This module only runs when invoked directly, so importing it is free of side effects.
 */

const exec = promisify(execFile);

const PER_PAGE = 100;
const MAX_NOTIFICATIONS = 200;
const CONCURRENCY = 6;
const OUT = path.resolve(process.cwd(), "data", "private", "github.jsonl");

interface Notification {
  id: string;
  unread: boolean;
  reason: string;
  updated_at: string;
  last_read_at: string | null;
  subject: { title: string; type: string; url: string | null; latest_comment_url: string | null };
  repository: { full_name: string };
}

/** gh api, parsed as JSON. Returns null when gh reports the resource is missing. */
async function gh<T>(endpoint: string): Promise<T | null> {
  try {
    const { stdout } = await exec("gh", ["api", "-H", "Accept: application/vnd.github+json", endpoint], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout) as T;
  } catch (err) {
    const text = String(err);
    if (/HTTP 40[34]|Not Found/.test(text)) return null;
    throw err;
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchNotifications(): Promise<Notification[]> {
  const all: Notification[] = [];
  for (let page = 1; all.length < MAX_NOTIFICATIONS; page++) {
    const batch = await gh<Notification[]>(`/notifications?all=true&per_page=${PER_PAGE}&page=${page}`);
    if (!batch || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return all.slice(0, MAX_NOTIFICATIONS);
}

/** The latest comment on the thread is the user's, so the user answered after being notified. */
async function userCommented(n: Notification, login: string): Promise<boolean> {
  if (!n.subject.latest_comment_url) return false;
  const url = n.subject.latest_comment_url.replace("https://api.github.com", "");
  const comment = await gh<{ user?: { login?: string } }>(url);
  return comment?.user?.login === login;
}

/** GitHub records an unsubscribe as an ignored thread subscription. */
async function unsubscribed(n: Notification): Promise<boolean> {
  const sub = await gh<{ ignored?: boolean; subscribed?: boolean }>(`/notifications/threads/${n.id}/subscription`);
  return sub?.ignored === true;
}

/** Ids that were exported before but are gone from the inbox now were marked done. */
async function previousExport(): Promise<Item[]> {
  try {
    const raw = await readFile(OUT, "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => Item.parse(JSON.parse(l)));
  } catch {
    return [];
  }
}

function toItem(n: Notification, facts: GithubNotificationFacts): Item {
  return {
    id: `github:${n.id}`,
    source: "github",
    from: n.repository.full_name,
    subject: n.subject.title,
    snippet: `${n.subject.type} in ${n.repository.full_name}, notified because: ${n.reason}`,
    receivedAt: n.updated_at,
    meta: {
      repo: n.repository.full_name,
      type: n.subject.type,
      reason: n.reason,
      url: n.subject.url ?? undefined,
      commented: facts.userCommented,
      done: facts.done,
      unsubscribed: facts.unsubscribed,
      unread: facts.unread,
      readAt: n.last_read_at ?? undefined,
    },
    truth: deriveGithubAction(facts),
  };
}

/** A previously exported item that vanished from the inbox: the user marked it done. */
function markDone(item: Item): Item {
  const meta: Record<string, unknown> = { ...item.meta, done: true, unread: false };
  const facts: GithubNotificationFacts = {
    userCommented: item.meta.commented === true,
    done: true,
    unsubscribed: item.meta.unsubscribed === true,
    unread: false,
  };
  return { ...item, meta, truth: deriveGithubAction(facts) };
}

export async function main(): Promise<void> {
  const me = await gh<{ login: string }>("/user");
  if (!me?.login) throw new Error("gh api /user failed. Run: gh auth login");

  const notifications = await fetchNotifications();
  const items = await mapPool(notifications, CONCURRENCY, async (n) => {
    const [commented, ignored] = await Promise.all([userCommented(n, me.login), unsubscribed(n)]);
    return toItem(n, { userCommented: commented, done: false, unsubscribed: ignored, unread: n.unread });
  });

  const live = new Set(items.map((i) => i.id));
  const done = (await previousExport()).filter((i) => !live.has(i.id)).map(markDone);
  const all = [...items, ...done];

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, all.map((i) => JSON.stringify(Item.parse(i))).join("\n") + "\n");

  const counts = all.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.truth]: (acc[i.truth] ?? 0) + 1 }), {});
  console.log(`wrote ${all.length} items to ${OUT}`, counts);
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();
