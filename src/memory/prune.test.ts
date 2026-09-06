import { describe, it, expect } from "vitest";
import { prune, usageFromPredictions, DEFAULT_CAP, DEFAULT_WINDOW, type RunUsage } from "./prune.js";

/** two runs of history is the default window, so most tests need at least two entries */
const twoRuns = (a: RunUsage, b: RunUsage): RunUsage[] => [a, b];

describe("prune: defaults", () => {
  it("keeps rules cited in either of the last two runs", () => {
    const rules = ["a", "b", "c"];
    const r = prune(rules, twoRuns({ a: 3 }, { b: 1 }));
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.dropped.map((d) => [d.rule, d.reason])).toEqual([["c", "unused"]]);
  });

  it("drops a rule cited in the run before last but not in the window", () => {
    const r = prune(["a", "b"], [{ a: 9, b: 9 }, { a: 1 }, { a: 1 }]);
    expect(r.kept).toEqual(["a"]);
    expect(r.dropped[0]).toMatchObject({ rule: "b", reason: "unused", usage: 0 });
  });

  it("defaults are cap 20 and window 2", () => {
    expect(DEFAULT_CAP).toBe(20);
    expect(DEFAULT_WINDOW).toBe(2);
    const rules = Array.from({ length: 25 }, (_, i) => `rule ${i}`);
    const run: Record<string, number> = {};
    rules.forEach((rule, i) => (run[rule] = 25 - i));
    const r = prune(rules, twoRuns(run, run));
    expect(r.kept).toHaveLength(20);
    expect(r.dropped.map((d) => d.rule)).toEqual(rules.slice(20));
  });
});

describe("prune: cap", () => {
  it("keeps the highest usage rules when over the cap", () => {
    const r = prune(["low", "high", "mid"], twoRuns({ low: 1, high: 10, mid: 5 }, {}), { cap: 2 });
    expect(r.kept).toEqual(["high", "mid"]);
    expect(r.dropped).toEqual([
      { rule: "low", reason: "over-cap", usage: 1, detail: "ranked 3 of 3 by usage, cap is 2" },
    ]);
  });

  it("returns kept rules in their original order, not usage order", () => {
    const r = prune(["a", "b", "c"], twoRuns({ a: 1, b: 9, c: 5 }, {}), { cap: 3 });
    expect(r.kept).toEqual(["a", "b", "c"]);
  });

  it("sums usage across the window when ranking", () => {
    // b wins on the total even though a leads in the newest run
    const r = prune(["a", "b"], twoRuns({ b: 7 }, { a: 4, b: 1 }), { cap: 1 });
    expect(r.kept).toEqual(["b"]);
  });

  it("breaks usage ties on original position", () => {
    const r = prune(["first", "second"], twoRuns({ first: 2, second: 2 }, {}), { cap: 1 });
    expect(r.kept).toEqual(["first"]);
  });

  it("cap 0 drops everything", () => {
    const r = prune(["a"], twoRuns({ a: 1 }, {}), { cap: 0 });
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual(["over-cap"]);
  });

  it("a cap above the rule count changes nothing", () => {
    const r = prune(["a", "b"], twoRuns({ a: 1, b: 1 }, {}), { cap: 99 });
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.dropped).toEqual([]);
  });

  it("applies the unused rule before the cap, so stale rules never consume budget", () => {
    const r = prune(["stale", "used"], twoRuns({ used: 1 }, {}), { cap: 1 });
    expect(r.kept).toEqual(["used"]);
    expect(r.dropped.map((d) => d.reason)).toEqual(["unused"]);
  });
});

describe("prune: window", () => {
  it("holds every rule when history is shorter than the window", () => {
    const r = prune(["a", "b"], [{ a: 1 }]);
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.unusedApplied).toBe(false);
    expect(r.dropped).toEqual([]);
  });

  it("holds every rule when there is no history at all", () => {
    const r = prune(["a", "b"], []);
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.unusedApplied).toBe(false);
  });

  it("treats a bare record as a single run of history", () => {
    const r = prune(["a", "b"], { a: 1 });
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.unusedApplied).toBe(false);
    const narrow = prune(["a", "b"], { a: 1 }, { window: 1 });
    expect(narrow.kept).toEqual(["a"]);
    expect(narrow.unusedApplied).toBe(true);
  });

  it("window 1 ignores everything before the newest run", () => {
    const r = prune(["a", "b"], twoRuns({ b: 5 }, { a: 1 }), { window: 1 });
    expect(r.kept).toEqual(["a"]);
    expect(r.dropped[0]).toMatchObject({ rule: "b", reason: "unused" });
  });

  it("a wider window forgives a rule idle in the newest runs", () => {
    const r = prune(["a", "b"], [{ b: 3 }, { a: 1 }, { a: 1 }], { window: 3 });
    expect(r.kept).toEqual(["a", "b"]);
  });

  it("reports the window length in the drop detail", () => {
    const r = prune(["a"], twoRuns({}, {}));
    expect(r.dropped[0].detail).toBe("never cited in the last 2 runs");
    const one = prune(["a"], [{}], { window: 1 });
    expect(one.dropped[0].detail).toBe("never cited in the last 1 run");
  });
});

describe("prune: input hygiene", () => {
  it("accepts Map usage as well as records", () => {
    const r = prune(["a", "b"], [new Map([["a", 2]]), new Map([["a", 1]])]);
    expect(r.kept).toEqual(["a"]);
    expect(r.usage).toEqual({ a: 3, b: 0 });
  });

  it("trims rules and drops blanks", () => {
    const r = prune(["  a  ", "   ", "b"], twoRuns({ a: 1, b: 1 }, {}));
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.dropped).toEqual([{ rule: "   ", reason: "empty", usage: 0, detail: "blank rule" }]);
    expect(r.considered).toBe(2);
  });

  it("drops duplicates and keeps the first occurrence", () => {
    const r = prune(["a", "a", "b"], twoRuns({ a: 2, b: 1 }, {}));
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.dropped).toEqual([
      { rule: "a", reason: "duplicate", usage: 2, detail: "identical to an earlier rule" },
    ]);
  });

  it("ignores zero, negative and non-finite counts", () => {
    const r = prune(["a", "b", "c"], twoRuns({ a: 0, b: -3, c: Number.NaN }, {}));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual(["unused", "unused", "unused"]);
  });

  it("handles an empty rule list", () => {
    const r = prune([], twoRuns({ a: 1 }, {}));
    expect(r).toEqual({ kept: [], dropped: [], considered: 0, usage: {}, unusedApplied: true });
  });

  it("rejects an invalid cap or window", () => {
    expect(() => prune(["a"], [], { cap: -1 })).toThrow(RangeError);
    expect(() => prune(["a"], [], { cap: 1.5 })).toThrow(RangeError);
    expect(() => prune(["a"], [], { window: 0 })).toThrow(RangeError);
    expect(() => prune(["a"], [], { window: 2.5 })).toThrow(RangeError);
  });
});

describe("prune: purity", () => {
  it("does not mutate its inputs", () => {
    const rules = ["a", "b"];
    const runs: RunUsage[] = [{ a: 1 }, { b: 1 }];
    prune(rules, runs, { cap: 1 });
    expect(rules).toEqual(["a", "b"]);
    expect(runs).toEqual([{ a: 1 }, { b: 1 }]);
  });

  it("is deterministic across repeated calls", () => {
    const rules = ["a", "b", "c", "d"];
    const runs = twoRuns({ a: 2, b: 2, c: 1 }, { d: 0 });
    const first = prune(rules, runs, { cap: 2 });
    const second = prune(rules, runs, { cap: 2 });
    expect(second).toEqual(first);
  });

  it("reports usage for every non-blank rule", () => {
    const r = prune(["a", "b"], twoRuns({ a: 2 }, { a: 1 }), { cap: 1 });
    expect(r.usage).toEqual({ a: 3, b: 0 });
  });
});

describe("usageFromPredictions", () => {
  it("counts citations across predictions", () => {
    const counts = usageFromPredictions([
      { rulesUsed: ["a", "b"] },
      { rulesUsed: ["a"] },
      { rulesUsed: [] },
    ]);
    expect(counts).toEqual({ a: 2, b: 1 });
  });

  it("trims and ignores blank citations", () => {
    expect(usageFromPredictions([{ rulesUsed: [" a ", "", "   "] }])).toEqual({ a: 1 });
  });

  it("returns an empty record for no predictions", () => {
    expect(usageFromPredictions([])).toEqual({});
  });

  it("feeds prune directly", () => {
    const older = usageFromPredictions([{ rulesUsed: ["a"] }]);
    const newer = usageFromPredictions([{ rulesUsed: ["a", "b"] }]);
    const r = prune(["a", "b", "c"], [older, newer]);
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.dropped.map((d) => d.rule)).toEqual(["c"]);
  });
});
