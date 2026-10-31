import { describe, expect, it } from "vitest";
import { searchTerms } from "@/lib/board";

describe("search, typed or spoken", () => {
  it.each([
    ["Sharma", { company: "Sharma" }],
    ["Sharma dhundo", { company: "Sharma" }],
    ["Gupta Foods ka card dikhao.", { company: "Gupta Foods" }],
    ["search for NR Packaging", { company: "NR Packaging" }],
    ["REQ 4", { number: 4 }],
    ["REQ-004", { number: 4 }],
    ["req 12 kholo", { number: 12 }],
    ["  ", {}],
  ])("%s", (said, want) => {
    expect(searchTerms(said)).toEqual(want);
  });
});
