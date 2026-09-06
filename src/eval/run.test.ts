import { describe, it, expect } from "vitest";
import path from "node:path";
import { attends, partition, resultsDir, summarize } from "./run.js";
import { Action, type Item, type RunResult, type Split } from "../types.js";

function item(id: string, truth: Item["truth"] = "ignore"): Item {
  return {
    id,
    source: "gmail",
    from: "f@x.y",
    subject: `s-${id}`,
    snippet: "snip",
    receivedAt: "2026-01-01T00:00:00Z",
    meta: {},
    truth,
  };
}

const items = Array.from({ length: 1000 }, (_, i) => item(`item-${i}`));

describe("attends", () => {
  it("treats reply and act as attention, archive and ignore as skip", () => {
    expect(attends("reply")).toBe(true);
    expect(attends("act")).toBe(true);
    expect(attends("archive")).toBe(false);
    expect(attends("ignore")).toBe(false);
  });

  it("classifies every action in the schema", () => {
    for (const a of Action.options) expect(typeof attends(a)).toBe("boolean");
  });
});

describe("partition", () => {
  it("keeps every item exactly once, in disjoint halves", () => {
    const { learn, validate } = partition(items);
    expect(learn.length + validate.length).toBe(items.length);
    const learnIds = new Set(learn.map((it) => it.id));
    const validateIds = new Set(validate.map((it) => it.id));
    expect(learnIds.size).toBe(learn.length);
    expect(validateIds.size).toBe(validate.length);
    for (const id of validateIds) expect(learnIds.has(id)).toBe(false);
    expect(new Set([...learnIds, ...validateIds]).size).toBe(items.length);
  });

  it("splits roughly 70/30", () => {
    const { learn } = partition(items);
    const share = learn.length / items.length;
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.8);
  });

  it("is stable across calls", () => {
    const a = partition(items);
    const b = partition(items);
    expect(a.learn.map((it) => it.id)).toEqual(b.learn.map((it) => it.id));
    expect(a.validate.map((it) => it.id)).toEqual(b.validate.map((it) => it.id));
  });

  it("depends on the id only, not on order or on the rest of the item", () => {
    const shuffled = [...items].reverse().map((it) => ({ ...it, subject: "different", truth: "reply" as const }));
    const base = partition(items);
    const other = partition(shuffled);
    expect(new Set(other.learn.map((it) => it.id))).toEqual(new Set(base.learn.map((it) => it.id)));
    expect(new Set(other.validate.map((it) => it.id))).toEqual(new Set(base.validate.map((it) => it.id)));
  });

  it("preserves input order within each half", () => {
    const { learn, validate } = partition(items);
    const order = new Map(items.map((it, i) => [it.id, i]));
    for (const half of [learn, validate]) {
      const positions = half.map((it) => order.get(it.id)!);
      expect(positions).toEqual([...positions].sort((x, y) => x - y));
    }
  });

  it("handles an empty set", () => {
    expect(partition([])).toEqual({ learn: [], validate: [] });
  });
});

describe("resultsDir", () => {
  const splits: Split[] = ["train", "validate", "test"];

  it("defaults to the train split of the public tree", () => {
    expect(resultsDir("gmail")).toBe(path.resolve("results", "gmail", "train"));
  });

  it("builds results/<source>/<split> for every split", () => {
    for (const split of splits) {
      expect(resultsDir("gmail", false, split)).toBe(path.resolve("results", "gmail", split));
    }
  });

  it("inserts a private segment before the source when the private flag is set", () => {
    for (const split of splits) {
      expect(resultsDir("slack", true, split)).toBe(path.resolve("results", "private", "slack", split));
    }
  });

  it("returns an absolute path per source", () => {
    for (const source of ["gmail", "slack", "github"] as const) {
      const dir = resultsDir(source, false, "test");
      expect(path.isAbsolute(dir)).toBe(true);
      expect(dir.endsWith(path.join(source, "test"))).toBe(true);
    }
  });

  it("puts a tag dir as a sibling of the split dirs", () => {
    expect(path.dirname(resultsDir("gmail", false, "test"))).toBe(path.dirname(resultsDir("gmail", false, "train")));
  });
});

function result(over: Partial<RunResult> = {}): RunResult {
  return {
    run: 3,
    source: "gmail",
    split: "train",
    startedAt: "2026-01-01T00:00:00Z",
    items: 100,
    correct: 68,
    accuracy: 0.68,
    attendAccuracy: 0.815,
    perAction: {
      reply: { total: 20, correct: 14 },
      act: { total: 20, correct: 10 },
      archive: { total: 30, correct: 22 },
      ignore: { total: 30, correct: 22 },
    },
    costUsd: 0.0312,
    avgLatencyMs: 2143.7,
    memoryRules: 11,
    memory: { judgment: "", tools: "" },
    predictions: [],
    ...over,
  };
}

describe("summarize", () => {
  it("reports run, source, split, both accuracies, cost, latency and rules", () => {
    const line = summarize(result());
    expect(line).toContain("run 3 [gmail/train]");
    expect(line).toContain("acc 68.0%");
    expect(line).toContain("attend/skip 81.5%");
    expect(line).toContain("cost $0.0312");
    expect(line).toContain("avg 2144ms");
    expect(line).toContain("rules 11");
  });

  it("lists every action as correct/total on a second line", () => {
    const [head, tail] = summarize(result()).split("\n");
    expect(head).not.toContain("reply");
    expect(tail.trim()).toBe("reply 14/20  act 10/20  archive 22/30  ignore 22/30");
  });

  it("handles a zero run without NaN", () => {
    const line = summarize(
      result({
        items: 0,
        correct: 0,
        accuracy: 0,
        attendAccuracy: 0,
        costUsd: 0,
        avgLatencyMs: 0,
        memoryRules: 0,
        perAction: {
          reply: { total: 0, correct: 0 },
          act: { total: 0, correct: 0 },
          archive: { total: 0, correct: 0 },
          ignore: { total: 0, correct: 0 },
        },
      }),
    );
    expect(line).not.toMatch(/NaN|Infinity/);
    expect(line).toContain("acc 0.0%");
    expect(line).toContain("reply 0/0");
  });

  it("reflects the split it is given", () => {
    expect(summarize(result({ split: "test", source: "github", run: 12 }))).toContain("run 12 [github/test]");
  });
});
