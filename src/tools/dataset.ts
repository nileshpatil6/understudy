import { readFile } from "node:fs/promises";
import path from "node:path";
import { Item } from "../types.js";

/**
 * Dataset-backed source. Items are exported once from the real app (see scripts/export-gmail.md)
 * so eval runs are deterministic and free of API rate limits.
 * data/private/*.jsonl  real, gitignored
 * data/sample/*.jsonl   synthetic, committed, safe for demos and CI
 */
export async function loadItems(source: Item["source"], opts: { private?: boolean; limit?: number } = {}): Promise<Item[]> {
  const dir = opts.private ? "private" : "sample";
  const file = path.resolve(process.cwd(), "data", dir, `${source}.jsonl`);
  const raw = await readFile(file, "utf8");
  const items = raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => Item.parse(JSON.parse(l)));
  return opts.limit ? items.slice(0, opts.limit) : items;
}
