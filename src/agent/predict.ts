import { z } from "zod";
import { MODEL, completeJson } from "./llm.js";
import { readMemory, listRules } from "../memory/store.js";
import { Action, type Item, type Prediction } from "../types.js";

const Out = z.object({
  action: Action,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  rulesUsed: z.array(z.string()).default([]),
});

const SYSTEM_BASE = `You are Understudy: you predict what a specific person would do with an incoming item from one of their apps.

Actions:
- reply    they would write back
- act      they would do something about it soon (star, open, click through, follow up) without replying
- archive  they would archive/dismiss it immediately
- ignore   they would leave it unread and never touch it

You have a memory of rules learned from this person's past behavior. Apply matching rules. When no rule applies, fall back on general judgment.

Respond with only a JSON object:
{"action": "...", "confidence": 0.0-1.0, "reasoning": "one or two sentences", "rulesUsed": ["exact rule text you relied on", ...]}`;

export interface PredictContext {
  judgment: string;
  tools: string;
}

export async function loadContext(source: Item["source"]): Promise<PredictContext> {
  return { judgment: await readMemory("judgment", source), tools: await readMemory("tools", source) };
}

export function memoryRuleCount(ctx: PredictContext): number {
  return listRules(ctx.judgment).length + listRules(ctx.tools).length;
}

/**
 * Fields the agent is never shown. Ground truth is derived from these, so exposing them
 * would let the reflector learn the labeling function instead of the user's judgment.
 */
const HIDDEN_META = new Set(["labels", "labelIds", "reactions", "readAt", "done", "unsubscribed"]);

export function visibleMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(meta).filter(([k]) => !HIDDEN_META.has(k)));
}

export function renderItem(item: Item): string {
  const meta = visibleMeta(item.meta);
  const metaLine = Object.keys(meta).length ? `\nMeta: ${JSON.stringify(meta)}` : "";
  return `Source: ${item.source}\nFrom: ${item.from}\nSubject: ${item.subject}\nReceived: ${item.receivedAt}${metaLine}\n\n${item.body ?? item.snippet}`;
}

export async function predict(item: Item, ctx: PredictContext): Promise<Prediction> {
  // memory is identical across every item in a run, so it lives in the cacheable system prefix
  const system = `${SYSTEM_BASE}\n\n## Memory\n\n${ctx.judgment}\n\n${ctx.tools}`;
  const user = renderItem(item);

  let out: z.infer<typeof Out>;
  let usage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let latencyMs = 0;
  try {
    const r = await completeJson({ model: MODEL, system, user, effort: "low", maxTokens: 600 });
    ({ usage, costUsd, latencyMs } = r);
    out = Out.parse(r.json);
  } catch (e) {
    out = { action: "ignore", confidence: 0, reasoning: `error: ${(e as Error).message.slice(0, 120)}`, rulesUsed: [] };
  }
  return {
    itemId: item.id,
    ...out,
    costUsd,
    latencyMs,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}
