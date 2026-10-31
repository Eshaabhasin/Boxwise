import { describe, expect, it } from "vitest";
import type { CardState } from "@/lib/card";
import { diffLines } from "@/lib/commands/plan";
import { itemDetail, itemTitle } from "@/lib/quote/build";
import { QuotationEdit, applyQuotationEdit, type QuotationEdit as Edit } from "@/lib/quote/edit";

const CARD: CardState = {
  ref: "REQ-004",
  stage: "Quoted",
  customer: { company: "Gupta Foods", address: "Bhiwandi" },
  terms: { gstPercent: 18, deliveryTime: "10 days" },
  boxes: [
    { id: "b1", specs: { length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, quantity: 500, ratePerBox: 1800 } },
    { id: "b2", specs: { length: 457.2, breadth: 304.8, height: 254, dimUnit: "inch", ply: 7, quantity: 300, ratePerBox: 2200 } },
  ],
};

const plain = (s: Parameters<typeof itemTitle>[0]) => ({ title: itemTitle(s), detail: itemDetail(s) });

function base(): Edit {
  return {
    customer: { company: "Gupta Foods", contactPerson: "", phone: "", gstin: "", address: "Bhiwandi" },
    lines: CARD.boxes.map((b) => ({ itemId: b.id, ...plain(b.specs), quantity: Number(b.specs.quantity), rate: Number(b.specs.ratePerBox) / 100 })),
    terms: { gstPercent: 18, deliveryTime: "10 days", paymentTerms: "—", validity: "—" },
    notes: "",
  };
}

let n = 0;
const newId = () => `n${n++}`;

describe("edits typed on the quotation", () => {
  it("changes nothing when nothing was changed", () => {
    const r = applyQuotationEdit(CARD, base(), plain, newId);
    expect(diffLines(CARD, r.after)).toEqual([]);
    expect(r.lineText).toEqual({});
    expect(r.rename).toBeNull();
  });

  it("sends quantity and rate back to the box (rate typed in rupees, stored in paise)", () => {
    const e = base();
    e.lines[1] = { ...e.lines[1]!, quantity: 350, rate: 21.5 };
    const r = applyQuotationEdit(CARD, e, plain, newId);
    expect(diffLines(CARD, r.after)).toEqual(["Box 2 quantity: 300 → 350", "Box 2 rate per box: ₹22.00 → ₹21.50"]);
  });

  it("keeps reworded titles on the quotation only", () => {
    const e = base();
    e.lines[0] = { ...e.lines[0]!, title: "Master carton for biscuits" };
    const r = applyQuotationEdit(CARD, e, plain, newId);
    expect(r.lineText).toEqual({ b1: { title: "Master carton for biscuits" } });
    expect(diffLines(CARD, r.after)).toEqual([]);
  });

  it("removes a box when its line is removed, adds one for a new line", () => {
    const e = base();
    e.lines = [e.lines[0]!, { itemId: "new", title: "Divider", detail: "", quantity: 1000, rate: 2 }];
    const r = applyQuotationEdit(CARD, e, plain, newId);
    expect(r.after.boxes).toHaveLength(2);
    expect(r.after.boxes[1]?.specs).toEqual({ quantity: 1000, ratePerBox: 200 });
    expect(r.lineText[r.after.boxes[1]!.id]).toEqual({ title: "Divider" });
    expect(diffLines(CARD, r.after)).toContain("Remove Box 2 (18 × 12 × 10 inch · 7 ply · 300 pcs · @ ₹22.00)");
  });

  it("writes terms and customer details back to the enquiry; a blank clears them", () => {
    const e = base();
    e.terms = { gstPercent: 12, deliveryTime: "", paymentTerms: "30 days credit", validity: "15 days" };
    e.customer = { ...e.customer, phone: "9876543210", address: "" };
    const r = applyQuotationEdit(CARD, e, plain, newId);
    expect(diffLines(CARD, r.after)).toEqual(["Phone: 9876543210", "Address: Bhiwandi → not set", "GST %: 18% → 12%", "Delivery time: 10 days → not set", "Payment terms: 30 days credit", "Quote valid for: 15 days"]);
  });

  it("notices a typed rename of the company", () => {
    const e = base();
    e.customer = { ...e.customer, company: "Gupta Foods Pvt Ltd" };
    expect(applyQuotationEdit(CARD, e, plain, newId).rename).toBe("Gupta Foods Pvt Ltd");
  });

  it("rejects nonsense before it reaches the card", () => {
    const e = base();
    expect(QuotationEdit.safeParse({ ...e, lines: [] }).success).toBe(false);
    expect(QuotationEdit.safeParse({ ...e, lines: [{ ...e.lines[0]!, quantity: 2.5 }] }).success).toBe(false);
    expect(QuotationEdit.safeParse({ ...e, terms: { ...e.terms, gstPercent: 40 } }).success).toBe(false);
  });
});
