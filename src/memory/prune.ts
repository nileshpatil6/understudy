import type { Prediction } from "../types.js";

/**
 * Deterministic memory pruning. No model call.
 *
 * Consolidation (src/memory/consolidate.ts) asks a model to rewrite memory into fewer, broader
 * rules. That is expensive and non-deterministic. Pruning is the cheap half of the same job:
 * a rule the agent never cited in the last runs is not earning its place in the prompt, and
 * memory past the budget costs tokens on every single prediction.
 *
 * Two decisions, in order:
 *   1. Drop rules cited zero times across the recent usage window (default: the last two runs).
 *   2. Cap what is left at `cap` rules (default 20), preferring higher usage.
 *
 * Kept rules come back in their original order so the memory file stays stable in git; the
 * ranking only decides who survives, not who goes first.
 */

/** How often each rule was cited in one run. Keys are rule strings exactly as stored in memory. */
export type RunUsage = Record<string, number> | Map<string, number>;

/**
 * Usage history, oldest run first. A single record is treated as one run of history.
 * Only the last `window` entries are considered.
 */
export type UsageHistory = RunUsage | RunUsage[];

export type DropReason = "empty" | "duplicate" | "unused" | "over-cap";

export interface DroppedRule {
  rule: string;
  reason: DropReason;
  /** citations across the usage window, 0 when there is no history */
  usage: number;
  /** one line a human can read in a run log */
  detail: string;
}

export interface PruneOptions {
  /** maximum rules to keep. Default 20, matching RULE_BUDGET in consolidate.ts. */
  cap?: number;
  /** how many recent runs count as "recent". Default 2. */
  window?: number;
}

export interface PruneResult {
  /** rules to keep, in their original order */
  kept: string[];
  /** everything removed, in the order it was removed, with the reason */
  dropped: DroppedRule[];
  /** rules considered, after empty and duplicate rules were removed */
  considered: number;
  /** citations per kept and dropped rule across the window, for logging */
  usage: Record<string, number>;
  /** false when there was too little history to judge staleness, so no rule was dropped as unused */
  unusedApplied: boolean;
}

export const DEFAULT_CAP = 20;
export const DEFAULT_WINDOW = 2;

/** Build one run of usage from that run's predictions. Pure, so the maintainer can call it anywhere. */
export function usageFromPredictions(predictions: Pick<Prediction, "rulesUsed">[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of predictions) {
    for (const raw of p.rulesUsed ?? []) {
      const rule = raw.trim();
      if (!rule) continue;
      counts[rule] = (counts[rule] ?? 0) + 1;
    }
  }
  return counts;
}

export function prune(rules: string[], usage: UsageHistory, opts: PruneOptions = {}): PruneResult {
  const cap = opts.cap ?? DEFAULT_CAP;
  const window = opts.window ?? DEFAULT_WINDOW;
  if (!Number.isInteger(cap) || cap < 0) throw new RangeError(`cap must be a non-negative integer, got ${cap}`);
  if (!Number.isInteger(window) || window < 1) throw new RangeError(`window must be a positive integer, got ${window}`);

  const history = normalizeHistory(usage);
  const recent = history.slice(-window);
  // A rule added after the last run has no citations yet and is not stale, it is untested.
  // Only judge staleness once the window is actually full.
  const unusedApplied = recent.length >= window;

  const dropped: DroppedRule[] = [];
  const seen = new Set<string>();
  const candidates: { rule: string; index: number; used: number }[] = [];
  const usageOut: Record<string, number> = {};

  rules.forEach((raw, index) => {
    const rule = typeof raw === "string" ? raw.trim() : "";
    if (!rule) {
      dropped.push({ rule: String(raw ?? ""), reason: "empty", usage: 0, detail: "blank rule" });
      return;
    }
    const used = countIn(recent, rule);
    usageOut[rule] = used;
    if (seen.has(rule)) {
      dropped.push({ rule, reason: "duplicate", usage: used, detail: "identical to an earlier rule" });
      return;
    }
    seen.add(rule);
    candidates.push({ rule, index, used });
  });

  const survivors: { rule: string; index: number; used: number }[] = [];
  for (const c of candidates) {
    if (unusedApplied && c.used === 0) {
      dropped.push({
        rule: c.rule,
        reason: "unused",
        usage: 0,
        detail: `never cited in the last ${recent.length} run${recent.length === 1 ? "" : "s"}`,
      });
      continue;
    }
    survivors.push(c);
  }

  // Higher usage wins; ties break on original position so the result never depends on input order noise.
  const ranked = [...survivors].sort((a, b) => b.used - a.used || a.index - b.index);
  const keptSet = new Set(ranked.slice(0, cap).map((c) => c.index));
  ranked.slice(cap).forEach((c, i) => {
    dropped.push({
      rule: c.rule,
      reason: "over-cap",
      usage: c.used,
      detail: `ranked ${cap + i + 1} of ${ranked.length} by usage, cap is ${cap}`,
    });
  });

  return {
    kept: survivors.filter((c) => keptSet.has(c.index)).map((c) => c.rule),
    dropped,
    considered: candidates.length,
    usage: usageOut,
    unusedApplied,
  };
}

function normalizeHistory(usage: UsageHistory): RunUsage[] {
  if (Array.isArray(usage)) return usage;
  return [usage];
}

function countIn(runs: RunUsage[], rule: string): number {
  let total = 0;
  for (const run of runs) {
    const n = run instanceof Map ? run.get(rule) : run[rule];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}
