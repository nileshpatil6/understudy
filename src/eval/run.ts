import { mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadItems } from "../tools/dataset.js";
import { predict, loadContext, memoryRuleCount } from "../agent/predict.js";
import { shutdownTracing } from "../agent/llm.js";
import { span } from "neatlogs";
import { Action, type Item, type RunResult, type Split } from "../types.js";

/**
 * Eval harness. Runs the agent over a fixed dataset, scores against derived ground truth,
 * writes results/<source>/run-N.json. Everything on the demo chart comes from these files.
 */
export async function runEval(opts: {
  source: Item["source"];
  limit?: number;
  privateData?: boolean;
  concurrency?: number;
  split?: Split;
  /** restrict to these ids (validate runs use the validate half of train) */
  ids?: Set<string>;
  /** evaluate with this memory instead of the files on disk (gating candidate rules) */
  memory?: { judgment: string; tools: string };
  /** write under results/.../<tag>/ instead of the split dir, for one-off baselines */
  tag?: string;
}): Promise<RunResult> {
  const split = opts.split ?? "train";
  const all = await loadItems(opts.source, { private: opts.privateData, limit: opts.limit, split: split === "validate" ? "train" : split });
  const items = opts.ids ? all.filter((it) => opts.ids!.has(it.id)) : all;
  const ctx = opts.memory ?? (await loadContext(opts.source));
  const outDir = opts.tag ? path.join(path.dirname(resultsDir(opts.source, opts.privateData, split)), opts.tag) : resultsDir(opts.source, opts.privateData, split);
  await mkdir(outDir, { recursive: true });
  const run = (await readdir(outDir)).filter((f) => /^run-\d+\.json$/.test(f)).length + 1;

  const predictions = await span(
    { kind: "WORKFLOW", name: `eval:${opts.source}:${split}:run-${run}` },
    () => mapLimit(items, opts.concurrency ?? 6, (it) => predict(it, ctx)),
  )();

  const perAction = Object.fromEntries(Action.options.map((a) => [a, { total: 0, correct: 0 }])) as RunResult["perAction"];
  let correct = 0;
  let attendCorrect = 0;
  items.forEach((it, i) => {
    perAction[it.truth].total++;
    if (predictions[i].action === it.truth) {
      correct++;
      perAction[it.truth].correct++;
    }
    if (attends(predictions[i].action) === attends(it.truth)) attendCorrect++;
  });
  const { macroF1, balancedAccuracy } = macroScores(items.map((it, i) => ({ predicted: predictions[i].action, truth: it.truth })));
  const result: RunResult = {
    run,
    source: opts.source,
    split,
    startedAt: new Date().toISOString(),
    items: items.length,
    correct,
    accuracy: items.length ? correct / items.length : 0,
    attendAccuracy: items.length ? attendCorrect / items.length : 0,
    macroF1,
    balancedAccuracy,
    perAction,
    costUsd: predictions.reduce((s, p) => s + p.costUsd, 0),
    avgLatencyMs: predictions.reduce((s, p) => s + p.latencyMs, 0) / Math.max(1, predictions.length),
    memoryRules: memoryRuleCount(ctx),
    memory: { judgment: ctx.judgment, tools: ctx.tools },
    predictions,
  };
  await writeFile(path.join(outDir, `run-${run}.json`), JSON.stringify(result, null, 2));
  return result;
}

/**
 * results/<source>/train, results/private/<source>/test, etc.
 * private = real data, gitignored. test = held out, never reflected on.
 */
export function resultsDir(source: Item["source"], privateData?: boolean, split: Split = "train"): string {
  return path.resolve("results", ...(privateData ? ["private"] : []), source, split);
}

/**
 * Per-class F1 and recall, averaged over the four classes.
 *
 * Raw accuracy is close to useless on this data: the real held-out set is 68% "ignore",
 * so a predictor that always answers "ignore" scores 67.7% while getting three of the
 * four classes completely wrong. Macro-F1 and balanced accuracy do not reward that;
 * a constant predictor scores 1/4 balanced accuracy by construction. See docs/metrics.md.
 */
export function macroScores(pairs: { predicted: Action; truth: Action }[]): { macroF1: number; balancedAccuracy: number } {
  let f1Sum = 0;
  let recallSum = 0;
  for (const a of Action.options) {
    const tp = pairs.filter((p) => p.predicted === a && p.truth === a).length;
    const fp = pairs.filter((p) => p.predicted === a && p.truth !== a).length;
    const fn = pairs.filter((p) => p.predicted !== a && p.truth === a).length;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    f1Sum += precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    recallSum += recall;
  }
  const n = Action.options.length;
  return { macroF1: f1Sum / n, balancedAccuracy: recallSum / n };
}

export function attends(a: Action): boolean {
  return a === "reply" || a === "act";
}

/** deterministic 70/30 split of the train set by id hash; the reflector learns from one half and is gated on the other */
export function partition(items: Item[]): { learn: Item[]; validate: Item[] } {
  const learn: Item[] = [];
  const validate: Item[] = [];
  for (const it of items) (hash(it.id) % 10 < 7 ? learn : validate).push(it);
  return { learn, validate };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
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
  return `run ${r.run} [${r.source}/${r.split}]  acc ${(r.accuracy * 100).toFixed(1)}%  attend/skip ${(r.attendAccuracy * 100).toFixed(1)}%  macroF1 ${(r.macroF1 * 100).toFixed(1)}%  cost $${r.costUsd.toFixed(4)}  avg ${r.avgLatencyMs.toFixed(0)}ms  rules ${r.memoryRules}\n  ${pa}`;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/eval/run.ts");
if (isMain) {
  const source = (process.env.SOURCE ?? "gmail") as Item["source"];
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  const split = (process.env.SPLIT ?? "train") as Split;
  // NO_MEMORY=1 scores the bare model, the baseline every learned run is compared against
  const memory = process.env.NO_MEMORY === "1" ? { judgment: "", tools: "" } : undefined;
  runEval({ source, limit, privateData: process.env.PRIVATE === "1", split, memory, tag: process.env.RESULTS_TAG })
    .then((r) => console.log(summarize(r)))
    .finally(shutdownTracing);
}
