import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectCreate } from "@/lib/commands/changes";
import { HarnessFile, compareCase, isDailyLimit, spokenSpecs, summarize, type HarnessCase } from "@/lib/harness/compare";
import { getField } from "@/lib/fields";
import { guardRequestFields, type GuardedRequest } from "@/lib/nlp/guard";
import { normalize } from "@/lib/nlp/normalize";

const SAID = "Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print";
const CASE: HarnessCase = {
  id: "x",
  said: SAID,
  expect: { company: "Sharma Packaging", quantity: 500, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2 },
  missing: ["boxType", "colour", "coating"],
};

/** What the harness does with one LLM answer: guard, then sort into customer, terms and boxes. */
function run(c: HarnessCase, fields: Record<string, unknown>, boxes: Record<string, unknown>[] = [], allBoxes = false) {
  const text = normalize(c.said);
  const top = guardRequestFields(fields, text);
  const heard = boxes.map((b) => ({ box: null, guarded: guardRequestFields(b, text) }));
  const dropped = [top, ...heard.map((h) => h.guarded)].flatMap((g: GuardedRequest) => g.dropped);
  return compareCase(c, collectCreate(top, heard, allBoxes), dropped, null);
}

describe("harness comparison", () => {
  it("passes the right card, comparing sizes in the spoken unit", () => {
    const r = run(CASE, CASE.expect);
    expect(r.problems).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it("passes the same box given as one box entry instead of top-level fields", () => {
    const { company, ...box } = CASE.expect;
    expect(run(CASE, { company }, [box]).problems).toEqual([]);
  });

  it("fails a wrong value", () => {
    expect(run(CASE, { ...CASE.expect, quantity: 5 }).pass).toBe(false);
  });

  it("fails an invented value even if the guard let it through", () => {
    const c = { ...CASE, said: `${SAID} B flute`, missing: undefined };
    expect(run(c, { ...CASE.expect, flute: "B" }).problems).toContain('flute: not said, but the card has "B"');
  });

  it("explains a value the guard dropped", () => {
    expect(run(CASE, { ...CASE.expect, quantity: 600 }).problems.some((p) => p.startsWith("quantity: dropped"))).toBe(true);
  });

  it("checks the NOT SAID list when given", () => {
    const r = run({ ...CASE, missing: ["boxType", "colour"] }, CASE.expect);
    expect(r.problems).toEqual(["missing: expected [boxType, colour], got [boxType, coating, colour]"]);
  });

  it("checks each box of a multi-box request", () => {
    const c: HarnessCase = {
      id: "m",
      said: "Mehta Traders ke do box pehla 14 by 10 by 8 inch 1000 piece doosra 20 by 16 by 12 inch 400 piece dono 3 ply",
      expect: { company: "Mehta Traders" },
      boxes: [
        { length: 14, breadth: 10, height: 8, dimUnit: "inch", quantity: 1000, ply: 3 },
        { length: 20, breadth: 16, height: 12, dimUnit: "inch", quantity: 400, ply: 3 },
      ],
    };
    const boxes = [
      { length: 14, breadth: 10, height: 8, dimUnit: "inch", quantity: 1000 },
      { length: 20, breadth: 16, height: 12, dimUnit: "inch", quantity: 400 },
    ];
    expect(run(c, { company: "Mehta Traders", ply: 3 }, boxes, true).problems).toEqual([]);
    expect(run(c, { company: "Mehta Traders" }, boxes, true).problems).toEqual(["box 1 ply: expected 3, got nothing", "box 2 ply: expected 3, got nothing"]);
    expect(run(c, { company: "Mehta Traders", ply: 3 }, boxes.slice(0, 1), true).problems[0]).toBe("boxes: expected 2, got 1");
  });

  it("tells a service error from a misread", () => {
    const r = compareCase(CASE, null, [], '429 {"error":{"message":"Rate limit reached ... tokens per day (TPD)"}}');
    expect(r.serviceError).toBe(true);
    expect(isDailyLimit(r.problems[0] ?? "")).toBe(true);
    expect(compareCase(CASE, null, [], "The language model gave an unusable answer twice").serviceError).toBe(false);
  });

  it("matches text on its words", () => {
    const c: HarnessCase = { id: "a", said: "address plot 45 wagle estate thane 100 box", expect: { address: "Plot 45 Wagle Estate Thane", quantity: 100 } };
    expect(run(c, { address: "Plot 45, Wagle Estate, Thane", quantity: 100 }).pass).toBe(true);
  });

  it("returns sizes in the spoken unit", () => {
    expect(spokenSpecs({ length: 304.8, dimUnit: "inch" }).length).toBe(12);
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

  it("has at least 30 requests with unique ids, some with several boxes", () => {
    expect(file.requests.length).toBeGreaterThanOrEqual(30);
    expect(new Set(file.requests.map((r) => r.id)).size).toBe(file.requests.length);
    expect(file.requests.some((r) => (r.boxes?.length ?? 0) > 1)).toBe(true);
  });

  it("only uses real field keys and never expects a rate", () => {
    for (const r of file.requests) {
      for (const key of [...Object.keys(r.expect), ...(r.boxes ?? []).flatMap((b) => Object.keys(b))]) {
        expect(getField(key), `${r.id}: ${key}`).toBeDefined();
        expect(getField(key)?.ownerOnly, `${r.id}: ${key}`).toBeFalsy();
      }
    }
  });

  it("expects only values the guard would accept from that text", () => {
    // If the guard drops an expected value, the expectation (or the guard) is wrong, whatever the LLM does.
    for (const r of file.requests) {
      const text = normalize(r.said);
      for (const values of [r.expect, ...(r.boxes ?? [])]) {
        expect(guardRequestFields(values, text).dropped, r.id).toEqual([]);
      }
    }
  });
});
