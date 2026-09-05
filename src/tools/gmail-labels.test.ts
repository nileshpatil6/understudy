import { describe, it, expect } from "vitest";
import { deriveAction } from "./gmail-labels.js";

describe("deriveAction", () => {
  it("reply wins over everything", () => {
    expect(deriveAction({ labelIds: ["INBOX", "UNREAD"], userReplied: true, messageCount: 2 })).toBe("reply");
  });
  it("starred means act", () => {
    expect(deriveAction({ labelIds: ["INBOX", "STARRED"], userReplied: false, messageCount: 1 })).toBe("act");
  });
  it("important and read means act", () => {
    expect(deriveAction({ labelIds: ["INBOX", "IMPORTANT"], userReplied: false, messageCount: 1 })).toBe("act");
  });
  it("no inbox label means archived", () => {
    expect(deriveAction({ labelIds: ["UNREAD"], userReplied: false, messageCount: 1 })).toBe("archive");
  });
  it("unread in inbox means ignored", () => {
    expect(deriveAction({ labelIds: ["INBOX", "UNREAD"], userReplied: false, messageCount: 1 })).toBe("ignore");
  });
});
