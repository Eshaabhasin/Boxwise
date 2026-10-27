import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HarnessFile, compareCase, isDailyLimit, spokenCard, summarize, type HarnessCase } from "@/lib/harness/compare";
import { getField } from "@/lib/fields";
import { guardRequestFields } from "@/lib/nlp/guard";
import { normalize } from "@/lib/nlp/normalize";

const SAID = "Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print";
const CASE: HarnessCase = {
  id: "x",
  said: SAID,
  expect: { company: "Sharma Packaging", quantity: 500, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2 },
  missing: ["address", "style", "flute", "joint"],
};

function run(fields: Record<string, unknown>) {
  return compareCase(CASE, guardRequestFields(fields, normalize(SAID)), null);
}

describe("harness comparison", () => {
  it("passes the right card, comparing sizes in the spoken unit", () => {
    const r = run(CASE.expect);
    expect(r.problems).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it("fails a wrong value", () => {
    const r = run({ ...CASE.expect, quantity: 5 });
    expect(r.pass).toBe(false);
  });

  it("fails an invented value even if the guard let it through", () => {
    const r = compareCase({ ...CASE, said: `${SAID} B flute` }, guardRequestFields({ ...CASE.expect, flute: "B" }, normalize(`${SAID} B flute`)), null);
    expect(r.problems).toContain('flute: not said, but the card has "B"');
  });

  it("explains a value the guard dropped", () => {
    const r = run({ ...CASE.expect, quantity: 600 });
    expect(r.problems.some((p) => p.startsWith("quantity: dropped"))).toBe(true);
  });

  it("checks the NOT SAID list when given", () => {
    const r = compareCase({ ...CASE, missing: ["address", "style"] }, guardRequestFields(CASE.expect, normalize(SAID)), null);
    expect(r.problems).toEqual(["missing: expected [address, style], got [address, flute, joint, style]"]);
  });

  it("tells a service error from a misread", () => {
    const r = compareCase(CASE, null, '429 {"error":{"message":"Rate limit reached ... tokens per day (TPD)"}}');
    expect(r.serviceError).toBe(true);
    expect(isDailyLimit(r.problems[0] ?? "")).toBe(true);
    expect(compareCase(CASE, null, "The language model gave an unusable answer twice").serviceError).toBe(false);
  });

  it("matches text on its words", () => {
    const c: HarnessCase = { id: "a", said: "address plot 45 wagle estate thane", expect: { address: "Plot 45 Wagle Estate Thane" } };
    const g = guardRequestFields({ address: "Plot 45, Wagle Estate, Thane" }, normalize(c.said));
    expect(compareCase(c, g, null).pass).toBe(true);
  });

  it("returns sizes said without a unit as spoken", () => {
    expect(spokenCard(guardRequestFields({ length: 12 }, "12 by 10")).length).toBe(12);
  });

  it("summarizes a run, leaving service errors and unrun requests out of the rate", () => {
    const s = summarize(
      [
        { id: "a", pass: true, problems: [] },
        { id: "b", pass: false, problems: ["x"] },
        { id: "c", pass: true, problems: [] },
        { id: "d", pass: false, serviceError: true, problems: ["429"] },
        undefined,
      ],
      ["a", "b", "c", "d", "e"],
      "m",
      new Date(0),
      new Date(4000),
    );
    expect(s).toMatchObject({ total: 5, passed: 2, failed: ["b"], notChecked: ["d", "e"], passRate: 66.7, complete: false, durationSec: 4 });
  });
});

describe("tests/requests.json", () => {
  const file = HarnessFile.parse(JSON.parse(readFileSync("tests/requests.json", "utf8")));

  it("has 30 requests with unique ids", () => {
    expect(file.requests).toHaveLength(30);
    expect(new Set(file.requests.map((r) => r.id)).size).toBe(30);
  });

  it("only uses real field keys and never expects a rate", () => {
    for (const r of file.requests) {
      for (const key of Object.keys(r.expect)) {
        expect(getField(key), `${r.id}: ${key}`).toBeDefined();
        expect(getField(key)?.ownerOnly, `${r.id}: ${key}`).toBeFalsy();
      }
    }
  });

  it("expects only values the guard would accept from that text", () => {
    // If the guard drops an expected value, the expectation (or the guard) is wrong, whatever the LLM does.
    for (const r of file.requests) {
      const g = guardRequestFields(r.expect, normalize(r.said));
      expect(g.dropped, r.id).toEqual([]);
    }
  });
});
