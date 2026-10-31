import { describe, expect, it } from "vitest";
import { toMm } from "@/lib/calc/units";
import type { Specs } from "@/lib/fields";
import { priceBox, sheetFor } from "@/lib/pricing/formula";
import { DEFAULT_RATES } from "@/lib/pricing/rates";

/** A box as the card stores it: sides in mm, said in inches. */
function box(type: string, l: number, b: number, h: number, more: Specs): Specs {
  return { boxType: type, length: toMm(l, "inch"), breadth: toMm(b, "inch"), height: toMm(h, "inch"), dimUnit: "inch", ...more };
}

function price(specs: Specs) {
  const r = priceBox(specs, DEFAULT_RATES);
  if (!r.ok) throw new Error("problem" in r ? r.problem : `missing ${r.missing.join(", ")}`);
  return r;
}

describe("sheet size", () => {
  it.each([
    ["Carton", 10, 6, 4, 34, 11],
    ["Carton", 12, 10, 8, 46, 19],
    ["Self-lock", 8, 8, 2, 23, 18],
    ["Self-lock", 8, 6, 2, 19, 17],
    ["Self-lock", 8, 6, 3, 22, 20],
    ["Inner carton", 4, 3, 4, 16, 11.25],
  ] as const)("%s %d × %d × %d → %d × %d", (type, l, b, h, a, w) => {
    const s = sheetFor(type, l, b, h);
    expect([s.a, s.b]).toEqual([a, w]);
  });
});

describe("price per box (your worked examples)", () => {
  it("carton 10 × 6 × 4, 3 ply, white, multi-colour, laminated, 1,000", () => {
    const r = price(box("Carton", 10, 6, 4, { ply: 3, colour: "White", print: "Multi-colour", coating: "Lamination", quantity: 1000, artwork: "We design" }));
    expect(r.ratePaise).toBe(2075);
    expect(r.slab).toBe("28 × 40");
    expect(r.dieChargePaise).toBe(450_000);
    expect(r.designChargePaise).toBe(500_000);
  });

  it("the same at 3,000 boxes shares the printing", () => {
    expect(price(box("Carton", 10, 6, 4, { ply: 3, colour: "White", print: "Multi-colour", coating: "Lamination", quantity: 3000 })).ratePaise).toBe(1642);
  });

  it.each([
    [3, 2709],
    [5, 4020],
    [7, 5768],
  ])("carton 12 × 10 × 8, %d ply, brown, plain", (ply, rate) => {
    expect(price(box("Carton", 12, 10, 8, { ply, colour: "Brown", print: "Plain", coating: "None", quantity: 1000 })).ratePaise).toBe(rate);
  });

  it("a big printed carton uses the larger slab and its minimum", () => {
    const r = price(box("Carton", 12, 10, 8, { ply: 3, colour: "Brown", print: "Multi-colour", coating: "None", quantity: 1000 }));
    expect(r.ratePaise).toBe(5109);
    expect(r.dieChargePaise).toBe(800_000);
  });

  it("refuses lamination on a sheet bigger than 28 × 40", () => {
    const r = priceBox(box("Carton", 12, 10, 8, { ply: 3, colour: "Brown", print: "Plain", coating: "Lamination", quantity: 1000 }), DEFAULT_RATES);
    expect(r.ok).toBe(false);
    expect("problem" in r && r.problem).toMatch(/only possible up to 28 × 40/);
  });

  it("self-lock 8 × 6 × 2, 3 ply, brown, multi-colour, laminated, 1,000", () => {
    const r = price(box("Self-lock", 8, 6, 2, { ply: 3, colour: "Brown", print: "Multi-colour", coating: "Lamination", quantity: 1000 }));
    expect(r.ratePaise).toBe(1272);
    expect(r.dieChargePaise).toBe(250_000);
  });

  it("inner carton 4 × 3 × 4: duplex, SBS, plain", () => {
    const base = { print: "Multi-colour", coating: "Lamination", quantity: 1000 };
    expect(price(box("Inner carton", 4, 3, 4, base)).ratePaise).toBe(1102);
    expect(price(box("Inner carton", 4, 3, 4, { ...base, board: "SBS" })).ratePaise).toBe(1732);
    expect(price(box("Inner carton", 4, 3, 4, { print: "Plain", coating: "None", quantity: 1000 })).ratePaise).toBe(630);
  });

  it("slitter and an existing die drop the die; design only when we make it", () => {
    const specs = box("Carton", 10, 6, 4, { ply: 3, colour: "Brown", print: "Multi-colour", coating: "None", quantity: 1000 });
    expect(price({ ...specs, cutting: "Slitter" }).dieChargePaise).toBe(0);
    expect(price({ ...specs, cutting: "Existing die" }).dieChargePaise).toBe(0);
    expect(price(specs).designChargePaise).toBe(0);
    expect(price({ ...specs, artwork: "We design" }).designChargePaise).toBe(500_000);
  });

  it("a number of colours counts as printed", () => {
    expect(price(box("Carton", 10, 6, 4, { ply: 3, colour: "Brown", printColours: 2, coating: "None", quantity: 1000 })).ratePaise).toBe(1809);
  });

  it("says what is missing instead of guessing", () => {
    expect(priceBox(box("Carton", 10, 6, 4, { ply: 3, quantity: 1000 }), DEFAULT_RATES)).toEqual({ ok: false, missing: ["colour", "print", "coating"] });
    expect(priceBox(box("Inner carton", 4, 3, 4, { print: "Plain", coating: "None" }), DEFAULT_RATES)).toEqual({ ok: false, missing: ["quantity"] });
  });
});
