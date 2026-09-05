import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { REFLECT_MODEL, completeJson, shutdownTracing } from "../agent/llm.js";
import { span } from "neatlogs";
import { loadItems } from "../tools/dataset.js";
import { resultsDir } from "../eval/run.js";
import { appendRules, readMemory } from "../memory/store.js";
import { visibleMeta } from "../agent/predict.js";
import type { Item, RunResult } from "../types.js";

/**
 * Reflector. Reads the latest run, looks at every miss, and writes new rules into memory.
 * This is the learning step. It only ever appends; git history shows memory growing.
 */
const Out = z.object({
  judgmentRules: z.array(z.string()),
  toolRules: z.array(z.string()),
  notes: z.string().optional(),
});

export async function reflect(opts: { source: Item["source"]; privateData?: boolean; maxMisses?: number }) {
  const dir = resultsDir(opts.source, opts.privateData, "train");
  const files = (await readdir(dir)).filter((f) => /^run-\d+\.json$/.test(f)).sort((a, b) => num(a) - num(b));
  if (files.length === 0) throw new Error("no runs yet, run the eval first");
  const latest: RunResult = JSON.parse(await readFile(path.join(dir, files.at(-1)!), "utf8"));
  const items = new Map((await loadItems(opts.source, { private: opts.privateData })).map((i) => [i.id, i]));

  const misses = latest.predictions
    .filter((p) => items.get(p.itemId)?.truth !== p.action)
    .slice(0, opts.maxMisses ?? 40)
    .map((p) => {
      const it = items.get(p.itemId)!;
      return {
        from: it.from,
        subject: it.subject,
        snippet: it.snippet.slice(0, 200),
        meta: visibleMeta(it.meta),
        predicted: p.action,
        actual: it.truth,
        agentReasoning: p.reasoning,
      };
    });
  const hits = latest.predictions.filter((p) => items.get(p.itemId)?.truth === p.action).length;

  const judgment = await readMemory("judgment", opts.source);
  const tools = await readMemory("tools", opts.source);

  const r = await span({ kind: "AGENT", name: `reflect:${opts.source}:run-${latest.run}` }, () => completeJson({
    model: REFLECT_MODEL,
    effort: "high",
    maxTokens: 24000,
    system: `You are the reflection step of a learning agent. The agent predicts what a specific person does with items from their ${opts.source}. You see its misses from the latest run and its current memory. Write NEW rules that would have prevented these misses and that generalize to unseen items.

Rules must be:
- specific and checkable ("emails from notifications@github.com about failed CI runs on the user's own repos -> act", not "be more careful")
- grounded in the evidence you see, not invented
- not duplicates of existing memory
- few. 3 to 8 judgment rules per reflection. Quality over volume.

Tool rules are about how to read this source better (which fields matter, what patterns in metadata are informative, what to ignore). Add tool rules only when a miss was caused by misreading the source.

Respond with only JSON: {"judgmentRules": [...], "toolRules": [...], "notes": "one paragraph on what pattern you found"}`,
    user: `Run ${latest.run}: ${hits}/${latest.items} correct.\n\n## Current judgment memory\n${judgment}\n\n## Current tool memory\n${tools}\n\n## Misses (predicted vs actual)\n${JSON.stringify(misses, null, 1)}`,
  }))();
  const out = Out.parse(r.json);
  await appendRules("judgment", out.judgmentRules, opts.source);
  await appendRules("tools", out.toolRules, opts.source);
  return { misses: misses.length, added: out.judgmentRules.length + out.toolRules.length, notes: out.notes, out, costUsd: r.costUsd };
}

function num(f: string): number {
  return Number(f.match(/\d+/)?.[0] ?? 0);
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/reflect/run.ts");
if (isMain) {
  const source = (process.env.SOURCE ?? "gmail") as Item["source"];
  reflect({ source, privateData: process.env.PRIVATE === "1" })
    .then((r) => {
      console.log(`reflected on ${r.misses} misses, added ${r.added} rules ($${r.costUsd.toFixed(4)})`);
      if (r.notes) console.log(r.notes);
    })
    .finally(shutdownTracing);
}
