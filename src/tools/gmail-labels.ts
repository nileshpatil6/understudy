import type { Action } from "../types.js";

/**
 * Derive ground truth from what Gmail already recorded about a thread.
 * No human labeling. This is the whole trick.
 */
export interface GmailThreadFacts {
  labelIds: string[];
  /** did the user send a message in this thread after the first inbound one */
  userReplied: boolean;
  /** message count in thread */
  messageCount: number;
}

export function deriveAction(f: GmailThreadFacts): Action {
  const labels = new Set(f.labelIds);
  if (f.userReplied) return "reply";
  if (labels.has("STARRED") || labels.has("IMPORTANT") && !labels.has("UNREAD")) return "act";
  if (!labels.has("INBOX")) return "archive";
  return "ignore";
}
