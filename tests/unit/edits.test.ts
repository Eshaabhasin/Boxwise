import { describe, expect, it } from "vitest";
import { buildEditPlan, buildStagePlan, buildUndoPlan, type CardState } from "@/lib/commands/plan";
import type { LlmClient } from "@/lib/nlp/llm";
import { guardRequestFields } from "@/lib/nlp/guard";
import { normalize } from "@/lib/nlp/normalize";
import { parseCommand } from "@/lib/nlp/parse";

const SHARMA: CardState = {
  ref: "REQ-001",
  stage: "New",
  specs: { company: "Sharma Packaging", length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, loadKg: 30, quantity: 600, printColours: 2, flute: "B", joint: "Stitched" },
};

function edit(fields: Record<string, unknown>, said: string, card: CardState = SHARMA) {
  const unit = card.specs.dimUnit === "inch" || card.specs.dimUnit === "mm" || card.specs.dimUnit === "cm" ? card.specs.dimUnit : undefined;
  return buildEditPlan(card, guardRequestFields(fields, normalize(said), { defaultUnit: unit }), []);
}

describe("edit plans", () => {
  it("shows before → after for 'height 9 inch kar do'", () => {
    const plan = edit({ height: 9, dimUnit: "inch" }, "height 9 inch kar do");
    expect(plan.lines).toEqual(["Height: 8 inch → 9 inch"]);
    expect(plan.set).toEqual({ height: 228.6 });
  });

  it("uses the card's unit when none is said", () => {
    const plan = edit({ height: 9 }, "height 9 kar do");
    expect(plan.set).toEqual({ height: 228.6 });
  });

  it("reads a side in another unit without changing the card's unit", () => {
    const plan = edit({ height: 250, dimUnit: "mm" }, "height 250 mm karo");
    expect(plan.set).toEqual({ height: 250 });
  });

  it("changes several fields at once", () => {
    const plan = edit({ quantity: 800, joint: "Glued" }, "quantity 800 karo aur joint glued");
    expect(plan.lines).toEqual(["Joint: Stitched → Glued", "Quantity: 600 → 800"]);
  });

  it("puts customer fields in the plan too", () => {
    const plan = edit({ address: "Bhiwandi godown" }, "address Bhiwandi godown daal do");
    expect(plan.lines).toEqual(["Address: Bhiwandi godown"]);
    expect(plan.card.missing).not.toContain("Address");
  });

  it("does not plan a value that is already on the card", () => {
    const plan = edit({ ply: 5 }, "5 ply hai");
    expect(plan.set).toEqual({});
    expect(plan.warnings[0]).toMatch(/already/);
  });

  it("never edits the rate", () => {
    const plan = edit({ ratePerBox: 18 }, "rate 18 rupees");
    expect(plan.set).toEqual({});
  });

  it("refuses to rename the customer", () => {
    const plan = edit({ company: "Sharma Traders" }, "Sharma Traders");
    expect(plan.set).toEqual({});
    expect(plan.warnings[0]).toMatch(/renaming/);
  });
});

describe("stage and undo plans", () => {
  it("moves a card to Won", () => {
    const plan = buildStagePlan(SHARMA, "Won");
    expect(plan.lines).toEqual(["Stage: New → Won"]);
    expect(plan.card.waitingOn).toBeNull();
  });

  it("undoes an edit back to the old values", () => {
    const after: CardState = { ...SHARMA, specs: { ...SHARMA.specs, quantity: 800 } };
    const plan = buildUndoPlan(after, { action: "edit", summary: "Quantity: 600 → 800", changes: [{ field: "quantity", before: 600, after: 800 }] });
    expect(plan.lines).toEqual(["Quantity: 800 → 600"]);
  });

  it("undoes a new field back to empty", () => {
    const plan = buildUndoPlan(SHARMA, { action: "edit", summary: "", changes: [{ field: "flute", before: null, after: "B" }] });
    expect(plan.lines).toEqual(["Flute: B → not set"]);
  });

  it("undoing a new card removes it", () => {
    const plan = buildUndoPlan(SHARMA, { action: "create", summary: "", changes: [] });
    expect(plan.lines[0]).toMatch(/^Remove card REQ-001/);
  });

  it("undoes a stage move", () => {
    const won: CardState = { ...SHARMA, stage: "Won" };
    expect(buildUndoPlan(won, { action: "stage", summary: "", changes: [], stageBefore: "New", stageAfter: "Won" }).lines).toEqual(["Stage: Won → New"]);
  });
});

describe("command parsing", () => {
  function reply(obj: object): LlmClient {
    return { provider: "fake", model: "fake", complete: async () => JSON.stringify(obj) };
  }

  it("tells the model which screen it was said on", async () => {
    const calls: string[] = [];
    const llm: LlmClient = {
      provider: "fake",
      model: "fake",
      complete: async (m) => {
        calls.push(m.at(-1)?.content ?? "");
        return JSON.stringify({ intent: "edit_request", fields: { height: 9 } });
      },
    };
    await parseCommand("height nau inch kar do", llm, { screen: "card REQ-001 Sharma Packaging" });
    expect(calls[0]).toBe("Screen: card REQ-001 Sharma Packaging\nSaid: height 9 inch kar do");
  });

  it("drops a card name that was not said", async () => {
    const r = await parseCommand("order mil gaya", reply({ intent: "set_stage", target: "Gupta Foods", stage: "Won" }));
    expect(r.command?.target).toBeNull();
    expect(r.unclear[0]).toMatch(/Gupta Foods/);
  });

  it("keeps a REQ number target", async () => {
    const r = await parseCommand("REQ 2 kholo", reply({ intent: "open", target: "REQ 2" }));
    expect(r.command?.target).toBe("REQ 2");
  });

  it("reads a search with a filter", async () => {
    const r = await parseCommand("pending wale dikhao", reply({ intent: "search", filter: "Pending" }));
    expect(r.command).toMatchObject({ intent: "search", filter: "Pending", query: null });
    expect(r.request).toBeNull();
  });
});
