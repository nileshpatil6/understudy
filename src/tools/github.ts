import type { Action } from "../types.js";

/**
 * Derive ground truth from what the GitHub notification inbox already recorded.
 * No human labeling, same trick as src/tools/gmail-labels.ts.
 *
 *   reply    the user commented on the thread after the notification arrived
 *   archive  the user marked the notification done, or unsubscribed from the thread
 *   ignore   the notification is still unread
 *   act      the user read it and left it in the inbox, so it is still owed work
 *
 * Precedence is reply > archive > ignore > act. "act" is the residual bucket and the
 * noisiest label: reading a thread and leaving it open is weaker evidence than a comment.
 */
export interface GithubNotificationFacts {
  /** did the user post a comment on the thread after this notification arrived */
  userCommented: boolean;
  /** notification marked done in the GitHub notification inbox */
  done: boolean;
  /** user unsubscribed from the thread */
  unsubscribed: boolean;
  /** still unread in the notification inbox */
  unread: boolean;
}

export function deriveGithubAction(f: GithubNotificationFacts): Action {
  if (f.userCommented) return "reply";
  if (f.done || f.unsubscribed) return "archive";
  if (f.unread) return "ignore";
  return "act";
}
