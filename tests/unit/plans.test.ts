import { describe, expect, it } from "vitest";
import type { CardState } from "@/lib/card";
import { collectCreate, collectEdit, type HeardBox } from "@/lib/commands/changes";
import { applyEdit, buildCreatePlan, buildEditPlan, buildStagePlan, buildUndoPlan } from "@/lib/commands/plan";
import { display } from "@/lib/card";
import type { LlmClient } from "@/lib/nlp/llm";
import { guardRequestFields, type GuardedRequest } from "@/lib/nlp/guard";
import { normalize } from "@/lib/nlp/normalize";
import { parseCommand } from "@/lib/nlp/parse";

const NONE: GuardedRequest = { customer: {}, specs: {}, sizeWithoutUnit: null, dropped: [] };

function g(fields: Record<string, unknown>, said: string, allowRate = false): GuardedRequest {
  return guardRequestFields(fields, normalize(said), { allowRate });
}

function boxes(said: string, list: [HeardBox["box"], Record<string, unknown>][], allowRate = false): HeardBox[] {
  return list.map(([box, fields]) => ({ box, guarded: g(fields, said, allowRate) }));
}

const SHARMA_BOX = { length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, loadKg: 30, quantity: 600, printColours: 2, flute: "B", joint: "Stitched" } as const;

const ONE: CardState = {
  ref: "REQ-001",
  stage: "New",
  customer: { company: "Sharma Packaging" },
  terms: {},
  boxes: [{ id: "a1", specs: { ...SHARMA_BOX } }],
};

const THREE: CardState = {
  ref: "REQ-004",
  stage: "New",
  customer: { company: "Gupta Foods" },
  terms: {},
  boxes: [
    { id: "b1", specs: { length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", quantity: 500, ply: 5 } },
    { id: "b2", specs: { length: 457.2, breadth: 304.8, height: 254, dimUnit: "inch", quantity: 300, ply: 5 } },
    { id: "b3", specs: { length: 254, breadth: 254, height: 101.6, dimUnit: "inch", quantity: 1000, ply: 5 } },
  ],
};

describe("new enquiry with several boxes", () => {
  const said = "Gupta Foods ke 3 box chahiye pehla 12 by 10 by 8 inch 500 piece doosra 18 by 12 by 10 inch 300 piece teesra 10 by 10 by 4 inch 1000 piece sab 5 ply stitched";
  const top = g({ company: "Gupta Foods", ply: 5, joint: "Stitched" }, said);
  const heard = boxes(said, [
    [null, { length: 12, breadth: 10, height: 8, dimUnit: "inch", quantity: 500 }],
    [null, { length: 18, breadth: 12, height: 10, dimUnit: "inch", quantity: 300 }],
    [null, { length: 10, breadth: 10, height: 4, dimUnit: "inch", quantity: 1000 }],
  ]);

  it("gives every box the shared details", () => {
    const card = collectCreate(top, heard, true);
    expect(card.customer).toEqual({ company: "Gupta Foods" });
    expect(card.boxes).toHaveLength(3);
    for (const b of card.boxes) expect(b).toMatchObject({ ply: 5, joint: "Stitched" });
    expect(card.boxes[1]).toMatchObject({ length: 457.2, quantity: 300 });
    expect(card.warnings).toEqual([]);
  });

  it("plans one line per box", () => {
    const plan = buildCreatePlan(collectCreate(top, heard, true), [], null);
    expect(plan.title).toBe("New enquiry from Gupta Foods (3 boxes)");
    expect(plan.lines).toContain("Box 1: 12 × 10 × 8 inch · 5 ply · stitched · 500 pcs");
    expect(plan.lines).toContain("Box 3: 10 × 10 × 4 inch · 5 ply · stitched · 1,000 pcs");
    expect(plan.lines.at(-1)).toBe("Not said: Box type, Colour, Print, Lamination / coating");
    expect(plan.card?.boxCount).toBe(3);
  });

  it("uses a unit said once for every box", () => {
    const s2 = "2 box 12 by 10 by 8 aur 10 by 8 by 6 sab inch me";
    const card = collectCreate(g({ dimUnit: "inch" }, s2), boxes(s2, [[null, { length: 12, breadth: 10, height: 8 }], [null, { length: 10, breadth: 8, height: 6 }]]), true);
    expect(card.boxes[1]).toMatchObject({ length: 254, breadth: 203.2, height: 152.4, dimUnit: "inch" });
  });
});

describe("one-box enquiry (fields at the top)", () => {
  it("still makes one box", () => {
    const said = "Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print";
    const card = collectCreate(g({ company: "Sharma Packaging", quantity: 500, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2 }, said), []);
    expect(card.boxes).toEqual([{ quantity: 500, length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2, print: "Multi-colour" }]);
    const plan = buildCreatePlan(card, [], null);
    expect(plan.lines).toContain("Box 1: 12 × 10 × 8 inch · 5 ply · 30 kg · 2-colour · 500 pcs");
    expect(plan.lines.at(-1)).toBe("Not said: Box type, Colour, Lamination / coating");
  });
});

describe("edits", () => {
  it("edits the only box without naming it", () => {
    const said = "height 9 inch kar do";
    const edit = collectEdit(ONE, g({ height: 9, dimUnit: "inch" }, said), []);
    const plan = buildEditPlan(ONE, edit, []);
    expect(plan.lines).toEqual(["Height: 8 inch → 9 inch"]);
  });

  it("uses the box's own unit when none is said", () => {
    const edit = collectEdit(ONE, g({ height: 9 }, "height 9 kar do"), []);
    expect(edit.set).toEqual([{ id: "a1", values: { height: 228.6 } }]);
  });

  it("asks which box on a card with several", () => {
    const edit = collectEdit(THREE, g({ height: 9 }, "height 9 kar do"), []);
    expect(edit.set).toEqual([]);
    expect(edit.warnings[0]).toMatch(/Which box\? This card has 3/);
  });

  it("changes box 2, removes box 3 and adds a box", () => {
    const said = "doosre box ki height 11 inch kar do teesra hata do aur ek naya box 14 by 10 by 6 inch 800 piece";
    const edit = collectEdit(THREE, NONE, boxes(said, [[2, { height: 11, dimUnit: "inch" }], ["new", { length: 14, breadth: 10, height: 6, dimUnit: "inch", quantity: 800 }]]), { remove: [3] });
    const plan = buildEditPlan(THREE, edit, []);
    expect(plan.lines).toEqual(["Box 2 height: 10 inch → 11 inch", "Add Box 3: 14 × 10 × 6 inch · 800 pcs", "Remove Box 3 (10 × 10 × 4 inch · 5 ply · 1,000 pcs)"]);
    expect(plan.after.boxes.map((b) => b.specs.quantity)).toEqual([500, 300, 800]);
  });

  it("applies a shared change to every box when he says so", () => {
    const edit = collectEdit(THREE, g({ joint: "Glued" }, "sab boxes glued kar do"), [], { allBoxes: true });
    expect(buildEditPlan(THREE, edit, []).lines).toEqual(["Box 1 joint: Glued", "Box 2 joint: Glued", "Box 3 joint: Glued"]);
  });

  it("reports a box that does not exist", () => {
    const edit = collectEdit(ONE, NONE, boxes("box 4 height 9 inch", [[4, { height: 9, dimUnit: "inch" }]]));
    expect(edit.warnings).toEqual(["There is no box 4 on this card (it has 1)."]);
  });

  it("puts customer fields and terms in the plan", () => {
    const edit = collectEdit(ONE, g({ address: "Bhiwandi godown", deliveryTime: "10 days" }, "address Bhiwandi godown delivery 10 days"), []);
    const plan = buildEditPlan(ONE, edit, []);
    expect(plan.lines).toEqual(["Address: Bhiwandi godown", "Delivery time: 10 days"]);
    expect(plan.card?.missing).not.toContain("Address");
  });

  it("plans nothing for a value already on the card", () => {
    const plan = buildEditPlan(ONE, collectEdit(ONE, g({ ply: 5 }, "5 ply hai"), []), []);
    expect(plan.empty).toBe(true);
  });

  it("never edits the rate outside set_rate", () => {
    const plan = buildEditPlan(ONE, collectEdit(ONE, g({ ratePerBox: 18 }, "rate 18 rupees"), []), []);
    expect(plan.empty).toBe(true);
  });

  it("refuses to rename the customer", () => {
    const plan = buildEditPlan(ONE, collectEdit(ONE, g({ company: "Sharma Traders" }, "Sharma Traders"), []), []);
    expect(plan.empty).toBe(true);
    expect(plan.warnings.some((w) => w.includes("renaming"))).toBe(true);
  });
});

describe("rates (set_rate)", () => {
  const said = "pehle box ka rate 18 doosre ka 22 teesre ka 9 rupees 50 paise GST 18 percent";

  it("sets a rate per box and works out the totals", () => {
    const edit = collectEdit(THREE, g({ gstPercent: 18 }, said, true), boxes(said, [[1, { ratePerBox: 18 }], [2, { ratePerBox: 22 }], [3, { ratePerBox: 9.5 }]], true));
    const plan = buildEditPlan(THREE, edit, [], { rate: true });
    expect(plan.lines).toEqual([
      "Box 1 rate per box: ₹18.00",
      "Box 2 rate per box: ₹22.00",
      "Box 3 rate per box: ₹9.50",
      "GST %: 18%",
      "Box 1: 500 × ₹18.00 = ₹9,000.00",
      "Box 2: 300 × ₹22.00 = ₹6,600.00",
      "Box 3: 1,000 × ₹9.50 = ₹9,500.00",
      "CGST 9% + SGST 9%: ₹4,518.00",
      "Total: ₹29,618.00",
      "Still needed before approval: Delivery time, Payment terms, Quote valid for",
    ]);
  });

  it("says which box still needs a rate", () => {
    const edit = collectEdit(THREE, g({ gstPercent: 18 }, said, true), boxes(said, [[1, { ratePerBox: 18 }]], true));
    const plan = buildEditPlan(THREE, edit, [], { rate: true });
    expect(plan.warnings).toContain("For the totals, still say: Box 2 rate; Box 3 rate.");
  });
});

describe("stage and undo", () => {
  it("moves a card to Won", () => {
    const plan = buildStagePlan(ONE, "Won");
    expect(plan.lines).toEqual(["Stage: New → Won"]);
    expect(plan.card?.waitingOn).toBeNull();
  });

  it("undoes an edit back to the snapshot", () => {
    let n = 0;
    const after = applyEdit(THREE, { customer: {}, terms: {}, set: [{ id: "b2", values: { quantity: 400 } }], add: [], remove: ["b3"] }, () => `x${n++}`);
    const plan = buildUndoPlan(after, { action: "edit", summary: "", before: THREE });
    expect(plan.lines).toEqual(["Box 2 quantity: 400 → 300", "Add Box 3: 10 × 10 × 4 inch · 5 ply · 1,000 pcs"]);
  });

  it("undoing a new card removes it", () => {
    expect(buildUndoPlan(ONE, { action: "create", summary: "" }).lines[0]).toMatch(/^Remove card REQ-001/);
  });
});

describe("display", () => {
  it("shows the rate in rupees, not paise", () => {
    expect(display("ratePerBox", 1800, {})).toBe("₹18.00");
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

  it("guards each box on its own", async () => {
    const r = await parseCommand(
      "pehla 12 by 10 by 8 inch doosra 18 by 12 by 10 inch",
      reply({ intent: "create_request", boxes: [{ fields: { length: 12, breadth: 10, height: 8, dimUnit: "inch" } }, { fields: { length: 18, breadth: 12, height: 99, dimUnit: "inch" } }] }),
    );
    expect(r.boxes).toHaveLength(2);
    expect(r.boxes[1]?.guarded.dropped.map((d) => d.field)).toEqual(["height"]);
  });

  it("drops a card name that was not said", async () => {
    const r = await parseCommand("order mil gaya", reply({ intent: "set_stage", target: "Gupta Foods", stage: "Won" }));
    expect(r.command?.target).toBeNull();
    expect(r.unclear[0]).toMatch(/Gupta Foods/);
  });

  it("does not warn when the model names the card on screen", async () => {
    const r = await parseCommand("rate 18 rupaye", reply({ intent: "set_rate", target: "BoxBol Test Co", fields: { ratePerBox: 18 } }), {
      screen: "card REQ-004 BoxBol Test Co",
      screenCompany: "BoxBol Test Co",
    });
    expect(r.command?.target).toBeNull();
    expect(r.unclear).toEqual([]);
  });

  it("reads a search with a filter", async () => {
    const r = await parseCommand("pending wale dikhao", reply({ intent: "search", filter: "Pending" }));
    expect(r.command).toMatchObject({ intent: "search", filter: "Pending", query: null });
    expect(r.request).toBeNull();
  });
});
