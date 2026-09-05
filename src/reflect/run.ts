import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { REFLECT_MODEL, completeJson, shutdownTracing } from "../agent/llm.js";
import { span } from "neatlogs";
import { loadItems } from "../tools/dataset.js";
import { resultsDir, runEval, partition } from "../eval/run.js";
import { readMemory, writeMemory, listRules } from "../memory/store.js";
import { consolidate, RULE_BUDGET } from "../memory/consolidate.js";
import { visibleMeta } from "../agent/predict.js";
import type { Item, RunResult } from "../types.js";

/**
 * Reflector, validation-gated.
 *
 *   1. Take the latest train run. Split train items 70/30 into learn / validate by id hash.
 *   2. Reflect on misses from the LEARN half only. Propose rules.
 *   3. Score the VALIDATE half with old memory (free: reuse the run's predictions) and with
 *      candidate memory (one small eval). Keep candidates only if validation does not drop.
 *   4. If validation dropped, or memory is over budget, consolidate: rewrite memory into fewer,
 *      more general rules, score again, keep the best of the three.
 *
 * The test split is never touched here. Git history + results/*.json show every decision.
 */
const Out = z.object({
  judgmentRules: z.array(z.string()),
  toolRules: z.array(z.string()),
  notes: z.string().optional(),
});

const TOLERANCE = 0.02;

export interface ReflectReport {
  run: number;
  misses: number;
  proposed: number;
  validateBefore: number;
  validateAfter: number;
  validateFinal: number;
  decision: "accepted" | "consolidated" | "rejected";
  rulesBefore: number;
  rulesAfter: number;
  costUsd: number;
  notes?: string;
}

export async function reflect(opts: { source: Item["source"]; privateData?: boolean; maxMisses?: number }): Promise<ReflectReport> {
  const dir = resultsDir(opts.source, opts.privateData, "train");
  const files = (await readdir(dir)).filter((f) => /^run-\d+\.json$/.test(f)).sort((a, b) => num(a) - num(b));
  if (files.length === 0) throw new Error("no runs yet, run the eval first");
  const latest: RunResult = JSON.parse(await readFile(path.join(dir, files.at(-1)!), "utf8"));
  const all = await loadItems(opts.source, { private: opts.privateData });
  const items = new Map(all.map((i) => [i.id, i]));
  const { learn, validate } = partition(all);
  const learnIds = new Set(learn.map((i) => i.id));
  const validateIds = new Set(validate.map((i) => i.id));

  // validation score under the current memory, straight from the run we already paid for
  const valPreds = latest.predictions.filter((p) => validateIds.has(p.itemId));
  const validateBefore = valPreds.filter((p) => items.get(p.itemId)?.truth === p.action).length / Math.max(1, valPreds.length);

  const misses = latest.predictions
    .filter((p) => learnIds.has(p.itemId) && items.get(p.itemId)?.truth !== p.action)
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
  const hits = latest.predictions.filter((p) => learnIds.has(p.itemId) && items.get(p.itemId)?.truth === p.action).length;

  const judgment = await readMemory("judgment", opts.source);
  const tools = await readMemory("tools", opts.source);
  let costUsd = 0;

  const r = await span({ kind: "AGENT", name: `reflect:${opts.source}:run-${latest.run}` }, () =>
    completeJson({
      model: REFLECT_MODEL,
      effort: "high",
      maxTokens: 24000,
      system: `You are the reflection step of a learning agent. The agent predicts what a specific person does with items from their ${opts.source} (reply | act | archive | ignore). You see its misses from the latest run and its current memory. Write NEW rules that would have prevented these misses AND that will hold on emails from senders you have never seen.

The rules you write will be tested on held-out emails before they are kept. Rules that only memorize a sender get thrown away. So:
- State rules by category and signal: what the message asks of the user, whether it continues a thread the user started, whether it is transactional / promotional / a code / a notification about the user's own work. Name a specific sender only if it recurs and no category captures it.
- Never write an exception to an existing exception. If an existing rule is wrong, say so in notes and write the corrected general rule instead.
- Prefer 3 to 6 rules. Fewer, broader rules beat many narrow ones.
- Each rule is one line, checkable, ending with the action.
- Tool rules only when a miss came from misreading the source (which field carries the signal).

Respond with only JSON: {"judgmentRules": [...], "toolRules": [...], "notes": "one paragraph: the pattern behind the misses"}`,
      user: `Run ${latest.run}: ${hits}/${learn.length} correct on the learn half.\n\n## Current judgment memory\n${judgment}\n\n## Current tool memory\n${tools}\n\n## Misses on the learn half (predicted vs actual)\n${JSON.stringify(misses, null, 1)}`,
    }),
  )();
  costUsd += r.costUsd;
  const out = Out.parse(r.json);

  const candidate = {
    judgment: appendText(judgment, out.judgmentRules),
    tools: appendText(tools, out.toolRules),
  };
  const gate = await runEval({ source: opts.source, privateData: opts.privateData, split: "validate", ids: validateIds, memory: candidate });
  costUsd += gate.costUsd;
  const validateAfter = gate.accuracy;

  let decision: ReflectReport["decision"] = "accepted";
  let final = candidate;
  let validateFinal = validateAfter;
  let notes = out.notes;
  const overBudget = listRules(candidate.judgment).length > RULE_BUDGET;

  if (validateAfter < validateBefore - TOLERANCE || overBudget) {
    const c = await consolidate({ source: opts.source, judgment: candidate.judgment, tools: candidate.tools, recentPredictions: latest.predictions });
    costUsd += c.costUsd;
    const g2 = await runEval({ source: opts.source, privateData: opts.privateData, split: "validate", ids: validateIds, memory: { judgment: c.judgment, tools: c.tools } });
    costUsd += g2.costUsd;
    const best = [
      { key: "consolidated" as const, mem: { judgment: c.judgment, tools: c.tools }, acc: g2.accuracy },
      { key: "accepted" as const, mem: candidate, acc: validateAfter },
      { key: "rejected" as const, mem: { judgment, tools }, acc: validateBefore },
    ].sort((a, b) => b.acc - a.acc)[0];
    decision = best.key;
    final = best.mem;
    validateFinal = best.acc;
    notes = `${out.notes ?? ""}\nconsolidation: ${c.before} -> ${c.after} rules. ${c.notes ?? ""}`.trim();
  }

  if (decision !== "rejected") {
    await writeMemory("judgment", final.judgment, opts.source);
    await writeMemory("tools", final.tools, opts.source);
  }

  return {
    run: latest.run,
    misses: misses.length,
    proposed: out.judgmentRules.length + out.toolRules.length,
    validateBefore,
    validateAfter,
    validateFinal,
    decision,
    rulesBefore: listRules(judgment).length,
    rulesAfter: listRules(final.judgment).length,
    costUsd,
    notes,
  };
}

function appendText(current: string, rules: string[]): string {
  const existing = new Set(listRules(current));
  const fresh = rules.map((r) => r.trim()).filter((r) => r && !existing.has(r));
  if (fresh.length === 0) return current;
  const body = current.endsWith("\n") ? current : current + "\n";
  return body + fresh.map((r) => `- ${r}`).join("\n") + "\n";
}

function num(f: string): number {
  return Number(f.match(/\d+/)?.[0] ?? 0);
}

export function describe(r: ReflectReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return `  reflect run ${r.run}: ${r.misses} misses -> ${r.proposed} proposed | validate ${pct(r.validateBefore)} -> ${pct(r.validateAfter)} | ${r.decision} @ ${pct(r.validateFinal)} | rules ${r.rulesBefore} -> ${r.rulesAfter} | $${r.costUsd.toFixed(3)}`;
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/reflect/run.ts");
if (isMain) {
  const source = (process.env.SOURCE ?? "gmail") as Item["source"];
  reflect({ source, privateData: process.env.PRIVATE === "1" })
    .then((r) => {
      console.log(describe(r));
      if (r.notes) console.log(r.notes);
    })
    .finally(shutdownTracing);
}
