import type { Action } from "../types.js";

/**
 * Derive ground truth from what Slack already recorded about a message.
 * No human labeling, same trick as `gmail-labels.ts`.
 *
 *   reply    the user posted in the thread after this message
 *   act      the user reacted to it, or saved it for later
 *   archive  the user read it (or opened the channel after it arrived) and did nothing else
 *   ignore   never read
 *
 * `channelOpenedAfter` is Slack's own read cursor moving past the message, not a
 * deliberate click on it, so it is the weakest of the read signals. It still only
 * ever separates archive from ignore, never act from archive.
 */
export interface SlackMessageFacts {
  /** did the user post a message in this thread after this one */
  userRepliedInThread: boolean;
  /** did the user add an emoji reaction to this message */
  userReacted: boolean;
  /** did the user save the message to Later */
  userSaved: boolean;
  /** did the user open the channel after this message arrived */
  channelOpenedAfter: boolean;
  /** was the message ever marked read */
  everRead: boolean;
}

export function deriveSlackAction(f: SlackMessageFacts): Action {
  if (f.userRepliedInThread) return "reply";
  if (f.userReacted || f.userSaved) return "act";
  if (f.everRead || f.channelOpenedAfter) return "archive";
  return "ignore";
}
