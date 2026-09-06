import { mkdir, writeFile } from "node:fs/promises";
import type { Item, Action } from "../src/types.js";

/**
 * Deterministic synthetic datasets with real-looking patterns, safe to commit and demo.
 * The patterns are learnable but not stated anywhere the agent can see: no field says
 * "mention means reply". The agent has to infer the rule from sender, subject, snippet
 * and the neutral metadata every source records anyway.
 *
 * Emits, all deterministic and stable across runs:
 *   data/sample/gmail.jsonl        144 train items
 *   data/sample/gmail.test.jsonl    60 held-out items, same generators, different instances
 *   data/sample/slack.jsonl        100 train items
 *   data/sample/github.jsonl       100 train items
 */
type Tpl = { from: string; subject: (i: number) => string; snippet: string; truth: Action; meta?: Record<string, unknown> };

/**
 * Gmail. The learnable shape: a human continuing a thread the user started, or a recruiter
 * moving to a concrete next step, is a reply. Machine mail that needs a decision is an act.
 * Machine mail that is only a record is an archive. Bulk marketing is an ignore.
 */
const GMAIL: Tpl[] = [
  { from: "notifications@github.com", subject: (i) => `[nileshpatil6/enduent-scraper] Run failed: Daily brief - main (${hex(i)})`, snippet: "Daily brief: All jobs have failed. View workflow run.", truth: "act", meta: { list: "ci_activity" } },
  { from: "notifications@github.com", subject: (i) => `[nileshpatil6/ghostCaptcha] Run failed: ci - main (${hex(i)})`, snippet: "ci: Some jobs were not successful.", truth: "act", meta: { list: "ci_activity" } },
  { from: "notifications@github.com", subject: (i) => `[vercel/next.js] New release v15.${i % 9}.0`, snippet: "A new release was published.", truth: "archive", meta: { list: "releases" } },
  { from: "noreply@swelist.com", subject: (i) => `${60 + (i % 40)} New Internships Posted Today`, snippet: "Here is your daily update of tech internships.", truth: "ignore" },
  { from: "notification@smartrecruiters.com", subject: () => "Your Application at Continental - Intern - AI Engineer", snippet: "Thank you for your application. We are currently reviewing.", truth: "ignore" },
  { from: "notification@smartrecruiters.com", subject: () => "Interview invitation - Intern - AI Engineer", snippet: "We would like to invite you to an interview. Please pick a slot.", truth: "reply" },
  { from: "recruiting@stripe.com", subject: () => "Next steps: Stripe Software Engineering Intern", snippet: "We would love to schedule a 30 minute call this week.", truth: "reply" },
  { from: "messages-noreply@linkedin.com", subject: () => "Chief Executive Officer you may know", snippet: "People you may know based on your profile.", truth: "ignore" },
  { from: "notifications-noreply@linkedin.com", subject: () => "You appeared in recent searches", snippet: "3 new updates for you.", truth: "ignore" },
  { from: "maazx@user.luma-mail.com", subject: () => "[TRACK INFORMATION]", snippet: "More information regarding the tracks and what we are looking for.", truth: "act" },
  { from: "support@devpost.com", subject: () => "Syndicate by Maximor: complete these steps before building", snippet: "Join the Discord, install AO, generate your pass.", truth: "act" },
  { from: "support@devpost.com", subject: (i) => `Shipaton Week ${i % 8}: ${30 - (i % 8) * 3} days left`, snippet: "Week in 60 seconds. The project gallery is public.", truth: "archive" },
  { from: "no-reply@alerts.spotify.com", subject: (i) => `${100000 + i * 7919} - Your Spotify login code`, snippet: "Enter this code to continue logging in.", truth: "archive" },
  { from: "team@namastedev.com", subject: () => "Teachers Day Gift for Your Learning Journey - Coupon Inside", snippet: "Celebrate learning with a special coupon.", truth: "ignore" },
  { from: "team@ship.emergent.sh", subject: () => "This might change your mind", snippet: "85% off Standard pass. Claim now.", truth: "ignore" },
  { from: "marketing@atlasfunded.com", subject: () => "Remember Why You Chose Us", snippet: "Because your comeback starts here.", truth: "ignore" },
  { from: "no-reply@slack.com", subject: () => "Confirm your email address to join Enduent", snippet: "Once you have confirmed your email you will be the newest member.", truth: "act" },
  { from: "ravi@enduent.com", subject: (i) => `Re: scraper output for client ${i % 5}`, snippet: "Can you check the JSON, looks like the date field is off?", truth: "reply", meta: { thread: true } },
  { from: "tajima@example.jp", subject: () => "納品スケジュールについて", snippet: "来週の納品スケジュールを確認させてください。", truth: "reply", meta: { client: true } },
  { from: "prof.sharma@college.edu", subject: (i) => `Assignment ${i % 6} deadline extended`, snippet: "The deadline has been moved to Friday.", truth: "act" },
  { from: "googledev-noreply@google.com", subject: () => "The Monthly Build - Google Developer Program", snippet: "A curated deep dive on the latest builder news.", truth: "ignore" },
  { from: "no_reply@email.heygen.com", subject: () => "Quick survey: How do you use avatar-led AI video?", snippet: "We are surveying creators.", truth: "ignore" },
  { from: "billing@vercel.com", subject: (i) => `Your Vercel invoice for ${["Jun", "Jul", "Aug", "Sep"][i % 4]}`, snippet: "Your invoice is ready. Amount: $20.00", truth: "archive" },
  { from: "billing@vercel.com", subject: () => "Payment failed for your Vercel team", snippet: "We could not charge your card. Update payment to avoid suspension.", truth: "act" },
];

/**
 * Slack. The learnable shape: a person addressing the user directly, or continuing a thread
 * the user is in, is a reply. A bot reporting something broken or something the user owes is
 * an act. A bot reporting something already settled is an archive. Social channels are ignore.
 * Nothing in the item states which channels are social or which senders are bots.
 */
const SLACK: Tpl[] = [
  { from: "priya.n", subject: () => "#eng-oncall", snippet: "@nilesh pager fired on checkout-api, can you take a look before I escalate?", truth: "reply", meta: { channel: "eng-oncall", mention: true } },
  { from: "ravi", subject: (i) => `#enduent-eng thread: scraper rerun ${i % 7}`, snippet: "did the rerun finish, or is it still stuck on the date field?", truth: "reply", meta: { channel: "enduent-eng", thread: true } },
  { from: "tajima", subject: () => "direct message", snippet: "来週の納品スケジュールを確認させてください。", truth: "reply", meta: { channel: "dm", dm: true } },
  { from: "alertmanager", subject: (i) => `#alerts-prod P1: checkout-api p99 ${900 + (i % 12) * 50}ms`, snippet: "latency above SLO for 10 minutes, no owner has acknowledged", truth: "act", meta: { channel: "alerts-prod", app: true } },
  { from: "deploybot", subject: (i) => `#deploys prod deploy ${4200 + i} failed`, snippet: "rollback did not complete, manual intervention required", truth: "act", meta: { channel: "deploys", app: true } },
  { from: "zoya", subject: () => "#design-review onboarding flow", snippet: "@nilesh left comments on step 3, need your call before I ship it", truth: "reply", meta: { channel: "design-review", mention: true } },
  { from: "standupbot", subject: (i) => `#eng-standup reminder ${i % 5}`, snippet: "you have not posted your standup yet, the thread closes at 11:00", truth: "act", meta: { channel: "eng-standup", app: true } },
  { from: "peoplebot", subject: () => "#announcements open enrollment", snippet: "@here benefits enrollment closes Friday, no action needed if you keep your plan", truth: "archive", meta: { channel: "announcements", app: true, broadcast: true } },
  { from: "kenji", subject: () => "#random kitchen", snippet: "someone left cake in the kitchen, second floor", truth: "ignore", meta: { channel: "random" } },
  { from: "giphy", subject: (i) => `#random gif ${i % 9}`, snippet: "/giphy shipping it", truth: "ignore", meta: { channel: "random", app: true } },
  { from: "salesbot", subject: (i) => `#wins deal closed ${20 + (i % 15)}k`, snippet: "new logo signed, contract already countersigned", truth: "archive", meta: { channel: "wins", app: true, broadcast: true } },
  { from: "arjun", subject: (i) => `#eng-platform migration plan v${i % 4}`, snippet: "@nilesh can you review the migration plan before the freeze?", truth: "reply", meta: { channel: "eng-platform", mention: true } },
  { from: "statuspage", subject: (i) => `#alerts-prod incident INC-${1500 + i} resolved`, snippet: "all services healthy, postmortem owner already assigned", truth: "archive", meta: { channel: "alerts-prod", app: true } },
  { from: "greenhouse", subject: (i) => `#hiring scorecard due for candidate ${i % 11}`, snippet: "your interview scorecard is 2 days overdue", truth: "act", meta: { channel: "hiring", app: true } },
  { from: "marketing", subject: (i) => `#general newsletter draft ${i % 6}`, snippet: "the September newsletter draft is live, skim it if you like", truth: "ignore", meta: { channel: "general", broadcast: true } },
  { from: "meera", subject: (i) => `#enduent-eng thread: client ${i % 5} JSON`, snippet: "client is asking again about the date field fix, what do I tell them?", truth: "reply", meta: { channel: "enduent-eng", thread: true } },
  { from: "jenkins", subject: (i) => `#ci build ${800 + i} failed on main`, snippet: "compile step failed, main is red for everyone", truth: "act", meta: { channel: "ci", app: true } },
  { from: "watercooler", subject: (i) => `#random poll ${i % 8}`, snippet: "coffee or chai, settle this once and for all", truth: "ignore", meta: { channel: "random", app: true } },
  { from: "financebot", subject: (i) => `#finance invoice INV-${3000 + i} posted`, snippet: "invoice recorded and paid, nothing outstanding", truth: "archive", meta: { channel: "finance", app: true } },
  { from: "securitybot", subject: (i) => `#alerts-prod CVE-2026-${1000 + i} in checkout-api`, snippet: "critical severity in a service you own, patch available now", truth: "act", meta: { channel: "alerts-prod", app: true } },
];

/**
 * GitHub notifications. The learnable shape: anything that is waiting on the user's words is a
 * reply, anything waiting on the user's hands is an act, a record of something already finished
 * is an archive, and activity on repositories the user does not own is an ignore.
 * The reason codes are the raw ones GitHub sends, and none of them map one to one onto an action.
 */
const GITHUB: Tpl[] = [
  { from: "priya-n", subject: (i) => `[nileshpatil6/enduent-scraper] Add retry to the date parser (#${120 + i})`, snippet: "requested your review on this pull request", truth: "reply", meta: { repo: "nileshpatil6/enduent-scraper", reason: "review_requested", type: "PullRequest" } },
  { from: "kenji-w", subject: (i) => `[nileshpatil6/enduent-scraper] Timezone drift in nightly brief (#${88 + i})`, snippet: "@nileshpatil6 which timezone should the brief be normalised to?", truth: "reply", meta: { repo: "nileshpatil6/enduent-scraper", reason: "mention", type: "Issue" } },
  { from: "arjun-k", subject: (i) => `[nileshpatil6/ghostCaptcha] Reduce solver latency (#${45 + i})`, snippet: "commented on your pull request: is the cache warm on cold start?", truth: "reply", meta: { repo: "nileshpatil6/ghostCaptcha", reason: "author", type: "PullRequest" } },
  { from: "github-actions", subject: (i) => `[nileshpatil6/enduent-scraper] Run failed: Daily brief - main (${hex(i)})`, snippet: "all jobs failed on the default branch", truth: "act", meta: { repo: "nileshpatil6/enduent-scraper", reason: "ci_activity", type: "CheckSuite" } },
  { from: "dependabot", subject: (i) => `[nileshpatil6/enduent-scraper] Critical advisory in transitive dep ${i % 7}`, snippet: "a critical severity advisory affects this repository", truth: "act", meta: { repo: "nileshpatil6/enduent-scraper", reason: "security_alert", type: "RepositoryVulnerabilityAlert" } },
  { from: "meera-s", subject: (i) => `[nileshpatil6/ghostCaptcha] Flaky test on windows runner (#${61 + i})`, snippet: "assigned this issue to you", truth: "act", meta: { repo: "nileshpatil6/ghostCaptcha", reason: "assign", type: "Issue" } },
  { from: "vercel", subject: (i) => `[vercel/next.js] Release v15.${i % 9}.0`, snippet: "a new release was published", truth: "archive", meta: { repo: "vercel/next.js", reason: "subscribed", type: "Release" } },
  { from: "colinhacks", subject: (i) => `[colinhacks/zod] Narrowing on records (#${3300 + i})`, snippet: "closed this issue as completed", truth: "archive", meta: { repo: "colinhacks/zod", reason: "subscribed", type: "Issue" } },
  { from: "mergequeue", subject: (i) => `[nileshpatil6/enduent-scraper] Pin the scraper user agent (#${131 + i})`, snippet: "merged your pull request into main", truth: "archive", meta: { repo: "nileshpatil6/enduent-scraper", reason: "author", type: "PullRequest" } },
  { from: "someone-else", subject: (i) => `[vitest-dev/vitest] Discussion: workspace globs (#${900 + i})`, snippet: "a new comment was added to a discussion you are watching", truth: "ignore", meta: { repo: "vitest-dev/vitest", reason: "subscribed", type: "Discussion" } },
  { from: "platform-team", subject: (i) => `[bigorg/monorepo] RFC ${i % 12}: package boundaries`, snippet: "@bigorg/reviewers please read when you get a chance", truth: "ignore", meta: { repo: "bigorg/monorepo", reason: "team_mention", type: "Issue" } },
  { from: "zoya-r", subject: (i) => `[nileshpatil6/ghostCaptcha] Swap to headless pool (#${52 + i})`, snippet: "requested your review on this pull request", truth: "reply", meta: { repo: "nileshpatil6/ghostCaptcha", reason: "review_requested", type: "PullRequest" } },
  { from: "ravi-p", subject: (i) => `[nileshpatil6/understudy] Memory grows unbounded (#${17 + i})`, snippet: "@nileshpatil6 can you take a look, is the cap intentional?", truth: "reply", meta: { repo: "nileshpatil6/understudy", reason: "mention", type: "Issue" } },
  { from: "github-actions", subject: (i) => `[nileshpatil6/ghostCaptcha] Run failed: ci - main (${hex(i)})`, snippet: "the ci workflow failed on the default branch", truth: "act", meta: { repo: "nileshpatil6/ghostCaptcha", reason: "ci_activity", type: "CheckSuite" } },
  { from: "dependabot", subject: (i) => `[expressjs/express] Bump qs from 6.${i % 9}.0 to 6.${(i % 9) + 1}.0`, snippet: "opened a pull request on a repository you watch", truth: "ignore", meta: { repo: "expressjs/express", reason: "subscribed", type: "PullRequest" } },
  { from: "priya-n", subject: (i) => `[nileshpatil6/understudy] Gate the reflector on validate (#${23 + i})`, snippet: "requested changes on your pull request: the split needs to be stable", truth: "reply", meta: { repo: "nileshpatil6/understudy", reason: "author", type: "PullRequest" } },
  { from: "github-advanced-security", subject: (i) => `[nileshpatil6/understudy] Secret scanning: token in commit ${hex(i)}`, snippet: "a credential was pushed to this repository, revoke it", truth: "act", meta: { repo: "nileshpatil6/understudy", reason: "security_alert", type: "SecretScanningAlert" } },
  { from: "nileshpatil6", subject: (i) => `[nileshpatil6/enduent-scraper] Release v0.${i % 8}.0`, snippet: "a release you published is now live", truth: "archive", meta: { repo: "nileshpatil6/enduent-scraper", reason: "subscribed", type: "Release" } },
  { from: "newsletter-bot", subject: (i) => `[trending/weekly] Issue ${i % 30}: what shipped this week`, snippet: "the weekly roundup for repositories you starred", truth: "ignore", meta: { repo: "trending/weekly", reason: "subscribed", type: "Issue" } },
  { from: "github-actions", subject: (i) => `[nileshpatil6/understudy] Run succeeded: nightly eval (${hex(i)})`, snippet: "the scheduled workflow completed with no failures", truth: "archive", meta: { repo: "nileshpatil6/understudy", reason: "ci_activity", type: "CheckSuite" } },
];

function hex(i: number) {
  return ((i * 2654435761) >>> 0).toString(16).slice(0, 7);
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Round-robins the templates so every class appears in every slice of the file, then shuffles
 * by a stable hash of the id. `startN` is the only thing that varies between a train set and its
 * held-out set: the same generators produce different instances, so the test set rewards a rule
 * about the sender and never a memorized subject line.
 */
function build(cfg: { source: Item["source"]; tpls: Tpl[]; count: number; startN: number; idPrefix: string; month: number }): Item[] {
  const items: Item[] = [];
  for (let k = 0; k < cfg.count; k++) {
    const n = cfg.startN + k;
    const t = cfg.tpls[k % cfg.tpls.length];
    const d = new Date(Date.UTC(2026, cfg.month, 1 + ((n * 7) % 30), (n * 13) % 24, (n * 17) % 60));
    items.push({
      id: `${cfg.idPrefix}${n}`,
      source: cfg.source,
      from: t.from,
      subject: t.subject(n),
      snippet: t.snippet,
      receivedAt: d.toISOString(),
      meta: t.meta ?? {},
      truth: t.truth,
    });
  }
  items.sort((a, b) => (hash(a.id) % 1000) - (hash(b.id) % 1000));
  return items;
}

async function emit(file: string, items: Item[]) {
  await writeFile(file, items.map((i) => JSON.stringify(i)).join("\n") + "\n");
  const per: Record<string, number> = {};
  for (const i of items) per[i.truth] = (per[i.truth] ?? 0) + 1;
  console.log(`wrote ${items.length} items to ${file} ${JSON.stringify(per)}`);
}

await mkdir("data/sample", { recursive: true });

// unchanged output: ids s1..s144, 6 rounds of the gmail templates
await emit("data/sample/gmail.jsonl", build({ source: "gmail", tpls: GMAIL, count: GMAIL.length * 6, startN: 1, idPrefix: "s", month: 7 }));

// held out, never reflected on: same generators, instances 145 onward, a later month
await emit("data/sample/gmail.test.jsonl", build({ source: "gmail", tpls: GMAIL, count: 60, startN: 145, idPrefix: "s", month: 8 }));

await emit("data/sample/slack.jsonl", build({ source: "slack", tpls: SLACK, count: SLACK.length * 5, startN: 1, idPrefix: "k", month: 7 }));

await emit("data/sample/github.jsonl", build({ source: "github", tpls: GITHUB, count: GITHUB.length * 5, startN: 1, idPrefix: "g", month: 7 }));
