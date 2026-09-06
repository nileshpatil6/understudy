import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { macroScores } from "../src/eval/run.js";
import { loadItems } from "../src/tools/dataset.js";
import type { Action, Item, RunResult } from "../src/types.js";

/**
 * Recomputes macroF1 and balancedAccuracy for run files written before those fields existed.
 *
 * Every run file stores its full prediction list, so this needs no model calls: the numbers are
 * derived from data already on disk and are identical to what the harness would have written.
 */
const sources: Item["source"][] = ["gmail", "slack", "github"];
let touched = 0;

for (const privateData of [false, true]) {
  for (const source of sources) {
    const truth = new Map<string, Action>();
    for (const split of ["train", "test"] as const) {
      try {
        for (const it of await loadItems(source, { private: privateData, split })) truth.set(it.id, it.truth);
      } catch {
        // that split does not exist for this source
      }
    }
    if (truth.size === 0) continue;

    const base = path.resolve("results", ...(privateData ? ["private"] : []), source);
    if (!existsSync(base)) continue;
    for (const dir of await readdir(base)) {
      const full = path.join(base, dir);
      for (const f of (await readdir(full)).filter((f) => f.endsWith(".json"))) {
        const file = path.join(full, f);
        const run: RunResult = JSON.parse(await readFile(file, "utf8"));
        const pairs = run.predictions
          .filter((p) => truth.has(p.itemId))
          .map((p) => ({ predicted: p.action, truth: truth.get(p.itemId)! }));
        if (pairs.length === 0) continue;
        const scores = macroScores(pairs);
        if (run.macroF1 === scores.macroF1 && run.balancedAccuracy === scores.balancedAccuracy) continue;
        await writeFile(file, JSON.stringify({ ...run, ...scores }, null, 2));
        touched++;
        console.log(
          `${path.relative(process.cwd(), file)}  acc ${(run.accuracy * 100).toFixed(1)}%  macroF1 ${(scores.macroF1 * 100).toFixed(1)}%  balanced ${(scores.balancedAccuracy * 100).toFixed(1)}%`,
        );
      }
    }
  }
}
console.log(`backfilled ${touched} run files`);
