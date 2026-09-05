import type { Action } from "../types.js";

/**
 * Derive ground truth from what Gmail already recorded about a message.
 * No human labeling. This is the whole trick.
 *
 *   reply    the user sent a message in the thread after this one
 *   act      starred, or Gmail marked it IMPORTANT and the user opened it
 *   archive  removed from INBOX, or opened in INBOX and then left alone
 *   ignore   still in INBOX, never opened
 *
 * IMPORTANT is Gmail's own signal, not a user click, so "act" is the noisiest label.
 * It is still far cheaper and more honest than hand-labeling 300 emails at hour 20.
 */
export interface GmailThreadFacts {
  labelIds: string[];
  /** did the user send a message in this thread after this one */
  userReplied: boolean;
}

export function deriveAction(f: GmailThreadFacts): Action {
  const labels = new Set(f.labelIds);
  const unread = labels.has("UNREAD");
  if (f.userReplied) return "reply";
  if (labels.has("STARRED")) return "act";
  if (labels.has("IMPORTANT") && !unread) return "act";
  if (!labels.has("INBOX")) return "archive";
  return unread ? "ignore" : "archive";
}
