import { mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadItems } from "../tools/dataset.js";
import { predict, loadContext, memoryRuleCount } from "../agent/predict.js";
import { Action, type Item, type RunResult } from "../types.js";

/**
 * Eval harness. Runs the agent over a fixed dataset, scores against derived ground truth,
 * writes results/<source>/run-N.json. Everything on the demo chart comes from these files.
 */
export async function runEval(opts: {
  source: Item["source"];
  limit?: number;
  privateData?: boolean;
  concurrency?: number;
}): Promise<RunResult> {
  const items = await loadItems(opts.source, { private: opts.privateData, limit: opts.limit });
  const ctx = await loadContext(opts.source);
  const outDir = path.resolve("results", opts.source);
  await mkdir(outDir, { recursive: true });
  const run = (await readdir(outDir)).filter((f) => /^run-\d+\.json$/.test(f)).length + 1;

  const predictions = await mapLimit(items, opts.concurrency ?? 6, (it) => predict(it, ctx));

  const perAction = Object.fromEntries(Action.options.map((a) => [a, { total: 0, correct: 0 }])) as RunResult["perAction"];
  let correct = 0;
  items.forEach((it, i) => {
    perAction[it.truth].total++;
    if (predictions[i].action === it.truth) {
      correct++;
      perAction[it.truth].correct++;
    }
  });
  const result: RunResult = {
    run,
    source: opts.source,
    startedAt: new Date().toISOString(),
    items: items.length,
    correct,
    accuracy: items.length ? correct / items.length : 0,
    perAction,
    costUsd: predictions.reduce((s, p) => s + p.costUsd, 0),
    avgLatencyMs: predictions.reduce((s, p) => s + p.latencyMs, 0) / Math.max(1, predictions.length),
    memoryRules: memoryRuleCount(ctx),
    predictions,
  };
  await writeFile(path.join(outDir, `run-${run}.json`), JSON.stringify(result, null, 2));
  return result;
}

async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, xs.length) }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await fn(xs[i]);
      }
    }),
  );
  return out;
}

export function summarize(r: RunResult): string {
  const pa = Object.entries(r.perAction)
    .map(([a, v]) => `${a} ${v.correct}/${v.total}`)
    .join("  ");
  return `run ${r.run} [${r.source}]  acc ${(r.accuracy * 100).toFixed(1)}%  cost $${r.costUsd.toFixed(4)}  avg ${r.avgLatencyMs.toFixed(0)}ms  rules ${r.memoryRules}\n  ${pa}`;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/eval/run.ts");
if (isMain) {
  const source = (process.env.SOURCE ?? "gmail") as Item["source"];
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  runEval({ source, limit, privateData: process.env.PRIVATE === "1" }).then((r) => console.log(summarize(r)));
}
