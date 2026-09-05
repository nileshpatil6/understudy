import { REFLECT_MODEL, completeJson } from "../agent/llm.js";
import { listRules } from "./store.js";
import type { Prediction } from "../types.js";

/**
 * Consolidation. When memory grows past a budget, or a reflection makes validation worse,
 * rewrite the whole memory into fewer, more general rules. Rules the agent actually cited
 * (Prediction.rulesUsed) are protected; sender-specific exceptions get merged or dropped.
 */
export const RULE_BUDGET = 20;

export async function consolidate(opts: {
  source: string;
  judgment: string;
  tools: string;
  recentPredictions: Prediction[];
  budget?: number;
}): Promise<{ judgment: string; tools: string; before: number; after: number; costUsd: number; notes?: string }> {
  const budget = opts.budget ?? RULE_BUDGET;
  const usage = new Map<string, number>();
  for (const p of opts.recentPredictions) for (const r of p.rulesUsed) usage.set(r, (usage.get(r) ?? 0) + 1);
  const ranked = listRules(opts.judgment)
    .map((r) => ({ rule: r, used: usage.get(r) ?? 0 }))
    .sort((a, b) => b.used - a.used);

  const r = await completeJson({
    model: REFLECT_MODEL,
    effort: "high",
    maxTokens: 24000,
    system: `You maintain the memory of an agent that predicts what a specific person does with items from their ${opts.source} (reply | act | archive | ignore). The memory has grown into many narrow, sender-specific rules and exceptions to exceptions. Rewrite it.

Goals, in order:
1. Generalize. Merge rules about the same kind of message into one rule stated by category and signal (what the message asks for, who it is from in general terms, whether it continues a conversation the user started), not by individual sender unless that sender recurs constantly.
2. Keep what works. A rule cited often by the agent (usage count given) encodes something real; preserve its meaning.
3. Drop contradictions and one-off exceptions. If two rules conflict, keep the more general one.
4. At most ${budget} judgment rules. Tool rules: at most 5, only about how to read the source.

Each rule must be one line, checkable, and end with the action. Respond with only JSON:
{"judgmentRules": [...], "toolRules": [...], "notes": "one paragraph on what you merged or dropped and why"}`,
    user: `## Judgment rules (with how often the agent cited each in the last run)\n${ranked.map((x) => `- [${x.used}x] ${x.rule}`).join("\n")}\n\n## Tool rules\n${listRules(opts.tools).map((x) => `- ${x}`).join("\n")}`,
  });
  const out = r.json as { judgmentRules: string[]; toolRules: string[]; notes?: string };
  const header = (title: string, blurb: string) => `# ${title}\n\n${blurb}\n\n`;
  const judgment =
    header("Judgment memory", "Rules the agent has learned about how this user handles items. One rule per line, prefixed with `- `.") +
    out.judgmentRules.slice(0, budget).map((x) => `- ${x.trim()}`).join("\n") +
    "\n";
  const tools =
    header("Tool memory", "Rules the agent has learned about using the source apps and their APIs. One rule per line, prefixed with `- `.") +
    out.toolRules.slice(0, 5).map((x) => `- ${x.trim()}`).join("\n") +
    "\n";
  return { judgment, tools, before: ranked.length, after: Math.min(out.judgmentRules.length, budget), costUsd: r.costUsd, notes: out.notes };
}
