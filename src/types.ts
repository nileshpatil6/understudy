import { z } from "zod";

/** What the human actually did with an item. Derived from the source app, never hand-labeled. */
export const Action = z.enum(["reply", "act", "archive", "ignore"]);
export type Action = z.infer<typeof Action>;

/** A source-agnostic item. Email today, Slack message or GitHub issue tomorrow. */
export const Item = z.object({
  id: z.string(),
  source: z.enum(["gmail", "slack", "github"]),
  from: z.string(),
  subject: z.string(),
  snippet: z.string(),
  body: z.string().optional(),
  receivedAt: z.string(),
  meta: z.record(z.string(), z.unknown()).default({}),
  /** ground truth, derived from what the user really did */
  truth: Action,
});
export type Item = z.infer<typeof Item>;

export const Prediction = z.object({
  itemId: z.string(),
  action: Action,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  rulesUsed: z.array(z.string()).default([]),
  costUsd: z.number(),
  latencyMs: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
});
export type Prediction = z.infer<typeof Prediction>;

export interface RunResult {
  run: number;
  source: Item["source"];
  startedAt: string;
  items: number;
  correct: number;
  accuracy: number;
  perAction: Record<Action, { total: number; correct: number }>;
  costUsd: number;
  avgLatencyMs: number;
  memoryRules: number;
  predictions: Prediction[];
}
