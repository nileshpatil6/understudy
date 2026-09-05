import "../env.js";
import OpenAI from "openai";

export const client = new OpenAI();

/** Models are env-driven so the eval can sweep cost/quality. */
export const MODEL = process.env.UNDERSTUDY_MODEL ?? "gpt-5-mini";
export const REFLECT_MODEL = process.env.UNDERSTUDY_REFLECT_MODEL ?? "gpt-5";

/** USD per 1M tokens. Cached input is billed at the cached rate. */
const PRICES: Record<string, { in: number; cached: number; out: number }> = {
  "gpt-5": { in: 1.25, cached: 0.125, out: 10 },
  "gpt-5-mini": { in: 0.25, cached: 0.025, out: 2 },
  "gpt-5-nano": { in: 0.05, cached: 0.005, out: 0.4 },
  "gpt-4.1": { in: 2, cached: 0.5, out: 8 },
  "gpt-4.1-mini": { in: 0.4, cached: 0.1, out: 1.6 },
  "gpt-4o-mini": { in: 0.15, cached: 0.075, out: 0.6 },
};

export interface Usage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

export function costUsd(model: string, u: Usage): number {
  const p = PRICES[model] ?? PRICES["gpt-5-mini"];
  const uncached = Math.max(0, u.inputTokens - u.cachedTokens);
  return (uncached * p.in + u.cachedTokens * p.cached + u.outputTokens * p.out) / 1_000_000;
}

export type Effort = "minimal" | "low" | "medium" | "high";

/**
 * One JSON-returning completion. System prompt goes first and unchanged across calls
 * so the provider's prompt cache can hit on it.
 */
export async function completeJson(opts: {
  model: string;
  system: string;
  user: string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<{ json: unknown; text: string; usage: Usage; costUsd: number; latencyMs: number }> {
  const t0 = Date.now();
  const isReasoning = /^(gpt-5|o\d)/.test(opts.model);
  const res = await client.chat.completions.create({
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: opts.maxTokens ?? 1000,
    ...(isReasoning ? { reasoning_effort: opts.effort ?? "low" } : { temperature: 0 }),
  });
  const latencyMs = Date.now() - t0;
  const text = res.choices[0]?.message?.content ?? "";
  const usage: Usage = {
    inputTokens: res.usage?.prompt_tokens ?? 0,
    cachedTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
  return { json: extractJson(text), text, usage, costUsd: costUsd(opts.model, usage), latencyMs };
}

/** Pull the first JSON object out of a text response, tolerating fences and preamble. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`no JSON object in response: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}
