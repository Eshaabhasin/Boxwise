import { describe, expect, it } from "vitest";
import { companyKey } from "@/lib/card";
import { fastCommand } from "@/lib/commands/fastpath";

describe("fast commands", () => {
  it.each([
    ["approve", "approve"],
    ["Approve.", "approve"],
    ["haan theek hai", "approve"],
    ["ok ji", "approve"],
    ["approve kar do please", "approve"],
    ["cancel", "cancel"],
    ["rehne do", "cancel"],
    ["undo", "undo"],
    ["wapas karo", "undo"],
  ])("%s -> %s", (text, cmd) => {
    expect(fastCommand(text)).toBe(cmd);
  });

  it.each(["Sharma Packaging 500 box approve", "ok 600 box", "nahi 600 box", ""])("is not a control word: %s", (text) => {
    expect(fastCommand(text)).toBeNull();
  });
});

describe("company key", () => {
  it("matches the same company said differently", () => {
    expect(companyKey("Sharma Packaging")).toBe(companyKey("sharma  packaging."));
  });
});
