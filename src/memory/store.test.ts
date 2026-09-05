import { describe, it, expect } from "vitest";
import { listRules } from "./store.js";

describe("listRules", () => {
  it("extracts bullet rules and ignores headers", () => {
    const md = "# Judgment memory\n\nintro\n\n- rule one\n- rule two\n\nnot a rule\n";
    expect(listRules(md)).toEqual(["rule one", "rule two"]);
  });
  it("returns empty for header-only memory", () => {
    expect(listRules("# Judgment memory\n")).toEqual([]);
  });
});
