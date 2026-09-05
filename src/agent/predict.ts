import { z } from "zod";
import { client, MODEL, costUsd, textOf, extractJson } from "./llm.js";
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

export async function predict(item: Item, ctx: PredictContext): Promise<Prediction> {
  const t0 = Date.now();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    output_config: { effort: "low" },
    // memory is identical across every item in a run, so it lives in the cached system prefix
    system: [
      { type: "text", text: SYSTEM_BASE },
      { type: "text", text: `## Memory\n\n${ctx.judgment}\n\n${ctx.tools}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Source: ${item.source}\nFrom: ${item.from}\nSubject: ${item.subject}\nReceived: ${item.receivedAt}\nMeta: ${JSON.stringify(item.meta)}\n\n${item.body ?? item.snippet}`,
      },
    ],
  });
  const latencyMs = Date.now() - t0;
  let out: z.infer<typeof Out>;
  try {
    out = Out.parse(extractJson(textOf(res)));
  } catch {
    out = { action: "ignore", confidence: 0, reasoning: `unparseable: ${textOf(res).slice(0, 120)}`, rulesUsed: [] };
  }
  return {
    itemId: item.id,
    ...out,
    costUsd: costUsd(MODEL, res.usage),
    latencyMs,
    inputTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
    outputTokens: res.usage.output_tokens,
  };
}
