import Anthropic from "@anthropic-ai/sdk";

export const client = new Anthropic();

/** Model is env-driven so the eval can sweep cost/quality. */
export const MODEL = process.env.UNDERSTUDY_MODEL ?? "claude-opus-5";
export const REFLECT_MODEL = process.env.UNDERSTUDY_REFLECT_MODEL ?? MODEL;

/** USD per 1M tokens. Cache reads billed at 0.1x input, cache writes at 1.25x. */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-fable-5-1": { in: 10, out: 50 },
};

export function costUsd(model: string, usage: Anthropic.Usage): number {
  const p = PRICES[model] ?? PRICES["claude-opus-5"];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  return (
    (usage.input_tokens * p.in + cacheRead * p.in * 0.1 + cacheWrite * p.in * 1.25 + usage.output_tokens * p.out) /
    1_000_000
  );
}

export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
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
