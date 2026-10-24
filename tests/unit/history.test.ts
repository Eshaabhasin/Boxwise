import { describe, expect, it } from "vitest";
import { CREATED_SUMMARY, entryAction, removeTexts } from "@/lib/commands/history";

describe("entryAction", () => {
  it("knows the card-making entry even when an 'edit' default was saved on it", () => {
    // Regression: REQ-001's first entry was saved with action "edit" by a schema default,
    // which would have made "undo" blank its fields instead of removing the card.
    expect(entryAction({ action: "edit", summary: CREATED_SUMMARY }, 0)).toBe("create");
  });

  it("treats an old first entry without action as the card being made", () => {
    expect(entryAction({ summary: "anything" }, 0)).toBe("create");
  });

  it("uses the stored action otherwise", () => {
    expect(entryAction({ action: "stage", summary: "Stage: New → Won" }, 3)).toBe("stage");
    expect(entryAction({ summary: "Height: 8 inch → 9 inch" }, 2)).toBe("edit");
  });
});

describe("removeTexts", () => {
  const at = new Date();
  it("takes back only the dictation a change added, newest copy first", () => {
    const raw = [
      { text: "Sharma Packaging 500 box", at },
      { text: "height 9 kar do", at },
      { text: "ply 5", at },
      { text: "height 9 kar do", at },
    ];
    expect(removeTexts(raw, ["height 9 kar do"]).map((r) => r.text)).toEqual([
      "Sharma Packaging 500 box",
      "height 9 kar do",
      "ply 5",
    ]);
  });

  it("ignores texts that are not there", () => {
    expect(removeTexts([{ text: "a", at }], ["b"])).toHaveLength(1);
  });
});
