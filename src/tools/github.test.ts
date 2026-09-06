import { describe, it, expect } from "vitest";
import { deriveGithubAction, type GithubNotificationFacts } from "./github.js";

const base: GithubNotificationFacts = {
  userCommented: false,
  done: false,
  unsubscribed: false,
  unread: false,
};

describe("deriveGithubAction", () => {
  it("commenting after the notification means reply", () => {
    expect(deriveGithubAction({ ...base, userCommented: true })).toBe("reply");
  });

  it("marked done means archive", () => {
    expect(deriveGithubAction({ ...base, done: true })).toBe("archive");
  });

  it("unsubscribed means archive", () => {
    expect(deriveGithubAction({ ...base, unsubscribed: true })).toBe("archive");
  });

  it("still unread means ignore", () => {
    expect(deriveGithubAction({ ...base, unread: true })).toBe("ignore");
  });

  it("read and left in the inbox means act", () => {
    expect(deriveGithubAction(base)).toBe("act");
  });

  it("reply beats done and unsubscribed", () => {
    expect(deriveGithubAction({ ...base, userCommented: true, done: true, unsubscribed: true })).toBe("reply");
  });

  it("reply beats unread", () => {
    expect(deriveGithubAction({ ...base, userCommented: true, unread: true })).toBe("reply");
  });

  it("done beats unread", () => {
    expect(deriveGithubAction({ ...base, done: true, unread: true })).toBe("archive");
  });

  it("unsubscribed beats unread", () => {
    expect(deriveGithubAction({ ...base, unsubscribed: true, unread: true })).toBe("archive");
  });

  it("only ever returns the four actions", () => {
    const flags = [false, true];
    const seen = new Set<string>();
    for (const userCommented of flags)
      for (const done of flags)
        for (const unsubscribed of flags)
          for (const unread of flags)
            seen.add(deriveGithubAction({ userCommented, done, unsubscribed, unread }));
    expect([...seen].sort()).toEqual(["act", "archive", "ignore", "reply"]);
  });
});
