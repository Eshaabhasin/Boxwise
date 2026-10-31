import { describe, expect, it } from "vitest";
import type { CardState } from "@/lib/card";
import { toMm } from "@/lib/calc/units";
import type { Specs } from "@/lib/fields";
import { priceEdit, priceNewCard, repriceTyped, withFormula } from "@/lib/pricing/apply";
import { DEFAULT_RATES } from "@/lib/pricing/rates";
import { buildQuote } from "@/lib/quote/build";
import { applyQuotationEdit } from "@/lib/quote/edit";

const CARTON: Specs = {
  boxType: "Carton",
  length: toMm(10, "inch"),
  breadth: toMm(6, "inch"),
  height: toMm(4, "inch"),
  dimUnit: "inch",
  ply: 3,
  colour: "White",
  print: "Multi-colour",
  coating: "Lamination",
  quantity: 1000,
};

function card(specs: Specs, terms: Specs = {}): CardState {
  return { ref: "REQ-009", stage: "New", customer: { company: "Test Co" }, terms, boxes: [{ id: "a", specs }] };
}

describe("the formula in plans", () => {
  it("prices a new enquiry and uses 5% GST unless he said one", () => {
    const r = priceNewCard({ customer: { company: "Test Co" }, terms: {}, boxes: [CARTON], warnings: [] }, DEFAULT_RATES);
    expect(r.card.boxes[0]?.ratePerBox).toBe(2075);
    expect(r.card.boxes[0]?.dieCharge).toBe(450_000);
    expect(r.card.boxes[0]?.designCharge).toBeUndefined();
    expect(r.card.terms.gstPercent).toBe(5);
    expect(r.lines[0]).toMatch(/Sheet 34 × 11 in = 374 sq in.*Rate per box: ₹20\.75/);
    expect(r.warnings.join(" ")).toMatch(/die-cut.*slitter/);
  });

  it("says what is still needed instead of guessing a rate", () => {
    const r = priceNewCard({ customer: {}, terms: {}, boxes: [{ ...CARTON, colour: undefined }], warnings: [] }, DEFAULT_RATES);
    expect(r.card.boxes[0]?.ratePerBox).toBeUndefined();
    expect(r.card.terms.gstPercent).toBeUndefined();
    expect(r.warnings).toEqual(["for the formula rate, still say: Colour."]);
  });

  it("a rate he says is his: kept, and the formula's shown beside it", () => {
    const p = withFormula({ ...CARTON, ratePerBox: 1900 }, DEFAULT_RATES, { ratePerBox: 1900 });
    expect(p.specs.ratePerBox).toBe(1900);
    expect(p.specs.ownerSet).toBe("ratePerBox");
    expect(p.warnings.join(" ")).toMatch(/your rate ₹19\.00 is kept; the formula gives ₹20\.75/);
    // Later, a new quantity leaves his rate alone.
    const again = withFormula({ ...p.specs, quantity: 3000 }, DEFAULT_RATES, { quantity: 3000 });
    expect(again.specs.ratePerBox).toBe(1900);
  });

  it("an edit reprices the box it changes", () => {
    const before = card({ ...CARTON, ratePerBox: 2075, dieCharge: 450_000 }, { gstPercent: 5 });
    const r = priceEdit(before, { customer: {}, terms: {}, set: [{ id: "a", values: { quantity: 3000 } }], add: [], remove: [], warnings: [] }, DEFAULT_RATES);
    expect(r.edit.set[0]?.values).toEqual({ quantity: 3000, ratePerBox: 1642 });
  });

  it("slitter drops the die charge", () => {
    const before = card({ ...CARTON, ratePerBox: 2075, dieCharge: 450_000 }, { gstPercent: 5 });
    const r = priceEdit(before, { customer: {}, terms: {}, set: [{ id: "a", values: { cutting: "Slitter" } }], add: [], remove: [], warnings: [] }, DEFAULT_RATES);
    expect(r.edit.set[0]?.values).toEqual({ cutting: "Slitter", dieCharge: null });
  });
});

describe("one-time charges on the quotation", () => {
  const priced = card({ ...CARTON, ratePerBox: 2075, dieCharge: 450_000, designCharge: 500_000 }, { gstPercent: 5 });

  it("are their own lines after the box", () => {
    const q = buildQuote(priced, "27");
    expect(q.lines.map((l) => [l.itemId, l.quantity, l.amountPaise])).toEqual([
      ["a", 1000, 2_075_000],
      ["a~die", 1, 450_000],
      ["a~design", 1, 500_000],
    ]);
    // ₹30,250 + 5% GST = ₹31,762.50, rounded to ₹31,763.
    expect(q.totals.totalPaise).toBe(3_176_300);
  });

  it("can be changed or removed on the quotation, and stay his", () => {
    const edit = {
      customer: { company: "Test Co", contactPerson: "", phone: "", gstin: "", address: "" },
      lines: [
        { itemId: "a", title: "Carton box, 3 ply, white", detail: "", quantity: 1000, rate: 20.75 },
        { itemId: "a~die", title: "Cutting die (one-time)", detail: "", quantity: 1, rate: 4000 },
      ],
      terms: { gstPercent: 5, deliveryTime: "", paymentTerms: "", validity: "" },
      notes: "",
    };
    const typed = applyQuotationEdit(priced, edit, () => ({ title: "", detail: "" }), () => "new");
    const after = repriceTyped(priced, typed.after, DEFAULT_RATES);
    const specs = after.boxes[0]?.specs ?? {};
    expect(specs.dieCharge).toBe(400_000);
    expect(specs.designCharge).toBeUndefined();
    expect(specs.ratePerBox).toBe(2075);
    expect(String(specs.ownerSet)).toBe("dieCharge designCharge");
  });

  it("a typed quantity reprices the box by the formula", () => {
    const edit = {
      customer: { company: "Test Co", contactPerson: "", phone: "", gstin: "", address: "" },
      lines: [
        { itemId: "a", title: "", detail: "", quantity: 3000, rate: 20.75 },
        { itemId: "a~die", title: "", detail: "", quantity: 1, rate: 4500 },
        { itemId: "a~design", title: "", detail: "", quantity: 1, rate: 5000 },
      ],
      terms: { gstPercent: 5, deliveryTime: "", paymentTerms: "", validity: "" },
      notes: "",
    };
    const typed = applyQuotationEdit(priced, edit, () => ({ title: "", detail: "" }), () => "new");
    const after = repriceTyped(priced, typed.after, DEFAULT_RATES);
    expect(after.boxes[0]?.specs.ratePerBox).toBe(1642);
  });
});
