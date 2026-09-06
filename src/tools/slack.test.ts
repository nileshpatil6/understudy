import { describe, it, expect } from "vitest";
import { deriveSlackAction, type SlackMessageFacts } from "./slack.js";

const base: SlackMessageFacts = {
  userRepliedInThread: false,
  userReacted: false,
  userSaved: false,
  channelOpenedAfter: false,
  everRead: false,
};

const facts = (over: Partial<SlackMessageFacts>): SlackMessageFacts => ({ ...base, ...over });

describe("deriveSlackAction", () => {
  it("replying in the thread means reply", () => {
    expect(deriveSlackAction(facts({ userRepliedInThread: true, everRead: true }))).toBe("reply");
  });
  it("reacting means act", () => {
    expect(deriveSlackAction(facts({ userReacted: true, everRead: true }))).toBe("act");
  });
  it("saving for later means act", () => {
    expect(deriveSlackAction(facts({ userSaved: true, everRead: true }))).toBe("act");
  });
  it("saving without reading still means act", () => {
    expect(deriveSlackAction(facts({ userSaved: true }))).toBe("act");
  });
  it("read and nothing else means archive", () => {
    expect(deriveSlackAction(facts({ everRead: true }))).toBe("archive");
  });
  it("opening the channel after it arrived means archive", () => {
    expect(deriveSlackAction(facts({ channelOpenedAfter: true }))).toBe("archive");
  });
  it("never read means ignore", () => {
    expect(deriveSlackAction(base)).toBe("ignore");
  });

  describe("precedence", () => {
    it("reply beats act", () => {
      expect(
        deriveSlackAction(facts({ userRepliedInThread: true, userReacted: true, userSaved: true })),
      ).toBe("reply");
    });
    it("reply beats archive", () => {
      expect(
        deriveSlackAction(facts({ userRepliedInThread: true, everRead: true, channelOpenedAfter: true })),
      ).toBe("reply");
    });
    it("reply beats ignore when the user answered without the message being marked read", () => {
      expect(deriveSlackAction(facts({ userRepliedInThread: true }))).toBe("reply");
    });
    it("act beats archive", () => {
      expect(
        deriveSlackAction(facts({ userReacted: true, everRead: true, channelOpenedAfter: true })),
      ).toBe("act");
    });
    it("act beats ignore", () => {
      expect(deriveSlackAction(facts({ userReacted: true }))).toBe("act");
    });
    it("archive beats ignore", () => {
      expect(deriveSlackAction(facts({ everRead: true }))).toBe("archive");
    });
    it("reply beats every other signal at once", () => {
      expect(
        deriveSlackAction({
          userRepliedInThread: true,
          userReacted: true,
          userSaved: true,
          channelOpenedAfter: true,
          everRead: true,
        }),
      ).toBe("reply");
    });
  });
});
