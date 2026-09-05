import { describe, it, expect } from "vitest";
import { renderItem, visibleMeta } from "./predict.js";

describe("label hiding", () => {
  it("never shows ground-truth-bearing fields to the agent", () => {
    const meta = { labels: ["UNREAD", "IMPORTANT"], cc: ["a@b.c"], inReplyToMine: true };
    expect(visibleMeta(meta)).toEqual({ cc: ["a@b.c"], inReplyToMine: true });
    const text = renderItem({
      id: "x", source: "gmail", from: "f@x.y", subject: "s", snippet: "snip", receivedAt: "2026-01-01T00:00:00Z", meta, truth: "ignore",
    });
    expect(text).not.toMatch(/UNREAD|IMPORTANT|labels/);
    expect(text).toContain("inReplyToMine");
  });
});
