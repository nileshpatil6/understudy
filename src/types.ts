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

/** train = reflector learns from its learn-half, gates on its validate-half; test = never touched */
export type Split = "train" | "validate" | "test";

export interface RunResult {
  run: number;
  source: Item["source"];
  /** train = the set the reflector learns from; test = held out, never reflected on */
  split: Split;
  startedAt: string;
  items: number;
  correct: number;
  accuracy: number;
  /** collapsed to attend (reply|act) vs skip (archive|ignore): the distinction a user actually feels */
  attendAccuracy: number;
  /** mean per-class F1. Immune to the class imbalance that makes raw accuracy misleading here. */
  macroF1: number;
  /** mean per-class recall. A constant predictor scores 1/numClasses by construction. */
  balancedAccuracy: number;
  perAction: Record<Action, { total: number; correct: number }>;
  costUsd: number;
  avgLatencyMs: number;
  memoryRules: number;
  /** exact memory the agent read for this run, so any run is reproducible from its file */
  memory: { judgment: string; tools: string };
  predictions: Prediction[];
}
