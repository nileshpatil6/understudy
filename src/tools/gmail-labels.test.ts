import { describe, it, expect } from "vitest";
import { deriveAction } from "./gmail-labels.js";

describe("deriveAction", () => {
  it("reply wins over everything", () => {
    expect(deriveAction({ labelIds: ["INBOX", "UNREAD"], userReplied: true })).toBe("reply");
  });
  it("starred means act", () => {
    expect(deriveAction({ labelIds: ["INBOX", "STARRED"], userReplied: false })).toBe("act");
  });
  it("important and opened means act", () => {
    expect(deriveAction({ labelIds: ["INBOX", "IMPORTANT"], userReplied: false })).toBe("act");
  });
  it("important but never opened means ignore", () => {
    expect(deriveAction({ labelIds: ["INBOX", "IMPORTANT", "UNREAD"], userReplied: false })).toBe("ignore");
  });
  it("no inbox label means archived", () => {
    expect(deriveAction({ labelIds: ["UNREAD"], userReplied: false })).toBe("archive");
  });
  it("opened in inbox and left means archive", () => {
    expect(deriveAction({ labelIds: ["INBOX"], userReplied: false })).toBe("archive");
  });
  it("unread in inbox means ignored", () => {
    expect(deriveAction({ labelIds: ["INBOX", "UNREAD"], userReplied: false })).toBe("ignore");
  });
});
