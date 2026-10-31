import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/calc/money";
import { buildQuote, financialYear, itemDetail, itemTitle, quoteGaps, quoteNumber, whatsappMessage } from "@/lib/quote/build";
import type { Specs } from "@/lib/fields";

const SHARMA: Specs = { length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, loadKg: 30, quantity: 500, printColours: 2, ratePerBox: 1800 };
const TERMS: Specs = { gstPercent: 18, deliveryTime: "10 days", paymentTerms: "50 percent advance" };
const CUSTOMER: Specs = { company: "Sharma Packaging" };

describe("quotation", () => {
  it("matches the reference quotation for one box", () => {
    const q = buildQuote({ customer: CUSTOMER, terms: TERMS, boxes: [{ id: "a", specs: SHARMA }] }, "27");
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ title: "Corrugated box, 5 ply", detail: "12 × 10 × 8 in · 30 kg load · 2-colour print", amountPaise: 900000 });
    expect(q.totals.gstPaise).toBe(162000);
    expect(formatINR(q.totals.totalPaise)).toBe("₹10,620.00");
    expect(q.gstMode).toBe("intra");
    expect(q.terms.validity).toBe("—");
  });

  it("adds up a line per box and works out GST once on the subtotal", () => {
    const q = buildQuote(
      {
        customer: CUSTOMER,
        terms: TERMS,
        boxes: [
          { id: "a", specs: SHARMA },
          { id: "b", specs: { length: 457.2, breadth: 304.8, height: 254, dimUnit: "inch", ply: 7, quantity: 300, ratePerBox: 2250 } },
        ],
      },
      "27",
    );
    expect(q.lines.map((l) => l.amountPaise)).toEqual([900000, 675000]);
    expect(q.totals.subtotalPaise).toBe(1575000);
    expect(q.totals.gstPaise).toBe(283500);
    expect(q.totals.totalPaise).toBe(1858500);
  });

  it("charges IGST to a customer in another state", () => {
    const q = buildQuote({ customer: { ...CUSTOMER, gstin: "07AAPFU0939F1ZV" }, terms: TERMS, boxes: [{ id: "a", specs: SHARMA }] }, "27");
    expect(q.gstMode).toBe("inter");
  });

  it("keeps wording typed over on the quotation", () => {
    const q = buildQuote({ customer: CUSTOMER, terms: TERMS, boxes: [{ id: "a", specs: SHARMA }] }, "27", { a: { title: "Master carton" } });
    expect(q.lines[0]?.title).toBe("Master carton");
    expect(q.lines[0]?.detail).toBe("12 × 10 × 8 in · 30 kg load · 2-colour print");
  });

  it("refuses without a rate (never invents one)", () => {
    const { ratePerBox, ...noRate } = SHARMA;
    void ratePerBox;
    expect(() => buildQuote({ customer: CUSTOMER, terms: TERMS, boxes: [{ id: "a", specs: noRate }] }, "27")).toThrow(/rate/);
  });

  it("says what is still needed, box by box", () => {
    const gaps = quoteGaps({ terms: { deliveryTime: "10 days" }, boxes: [{ id: "a", specs: SHARMA }, { id: "b", specs: { quantity: 100 } }] });
    expect(gaps.forDraft).toEqual(["Box 2 rate", "GST %"]);
    expect(gaps.forApproval).toEqual(["Payment terms", "Quote valid for"]);
  });
});

describe("item description", () => {
  it("names the style when it is not RSC", () => {
    expect(itemTitle({ ply: 7, style: "Die-cut" })).toBe("Corrugated box (Die-cut), 7 ply");
  });
  it("names the box type, ply and colour", () => {
    expect(itemTitle({ boxType: "Carton", ply: 3, colour: "White" })).toBe("Carton box, 3 ply, white");
    expect(itemTitle({ boxType: "Inner carton", board: "SBS" })).toBe("Inner carton, SBS 350 GSM");
  });
  it("lists the spec in a line", () => {
    expect(itemDetail({ length: 450, breadth: 300, height: 250, dimUnit: "mm", sizeType: "Outer", flute: "BC", printColours: 0, joint: "Glued" })).toBe(
      "450 × 300 × 250 mm (outer) · BC flute · plain · glued",
    );
  });
});

describe("numbering", () => {
  it("uses the Indian financial year in India time", () => {
    expect(financialYear(new Date("2026-10-24T10:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-03-31T17:00:00Z"))).toBe("2026-27");
    // 31 Mar 2027 19:30 UTC is already 1 Apr in India.
    expect(financialYear(new Date("2027-03-31T19:30:00Z"))).toBe("2027-28");
  });
  it("pads the sequence and marks revisions", () => {
    expect(quoteNumber("BB", "2026-27", 7)).toBe("BB/2026-27/0007");
    expect(quoteNumber("BB", "2026-27", 7, 2)).toBe("BB/2026-27/0007-R2");
  });
});

describe("WhatsApp message", () => {
  it("is written from the card for one box", () => {
    const q = buildQuote({ customer: CUSTOMER, terms: TERMS, boxes: [{ id: "a", specs: SHARMA }] }, "27");
    expect(whatsappMessage({ ...q, totalPaise: q.totals.totalPaise }, "BB/2026-27/0001", "Your Company")).toBe(
      "Dear Sharma Packaging, please find attached quotation BB/2026-27/0001 for your request (500 boxes, 12 × 10 × 8 inch, 5 ply, 30 kg load). Rate ₹18.00 per box + 18% GST, total ₹10,620.00. Delivery 10 days, payment 50 percent advance. Thank you, Your Company",
    );
  });

  it("points to the PDF for the rates of several boxes", () => {
    const q = buildQuote({ customer: CUSTOMER, terms: TERMS, boxes: [{ id: "a", specs: SHARMA }, { id: "b", specs: { quantity: 300, ratePerBox: 2250 } }] }, "27");
    expect(whatsappMessage({ ...q, totalPaise: q.totals.totalPaise }, "BB/2026-27/0002", "Your Company")).toContain("quotation BB/2026-27/0002 for your request of 2 boxes");
  });
});

describe("the message with one-time charges", () => {
  it("is plain English, counts only boxes, and says the total has the charges", () => {
    const m = whatsappMessage(
      {
        customerSnapshot: { company: "Eshaa Export" },
        lines: [
          { itemId: "a", quantity: 500, ratePaise: 1421, specs: { length: 254, breadth: 101.6, height: 50.8, dimUnit: "inch", ply: 3 } },
          { itemId: "a~die", quantity: 1, ratePaise: 250_000, specs: {} },
        ],
        gstPercent: 5,
        totalPaise: 1_008_500,
        terms: { deliveryTime: "10 days", paymentTerms: "50% Advance.", validity: "20 days" },
      },
      "BB/2026-27/0004",
      "RS Packers",
    );
    expect(m).toBe(
      "Dear Eshaa Export, please find attached quotation BB/2026-27/0004 for your request (500 boxes, 10 × 4 × 2 inch, 3 ply). Rate ₹14.21 per box + 5% GST, total ₹10,085.00 including one-time charges. Delivery 10 days, payment 50% Advance, rate valid for 20 days. Thank you, RS Packers",
    );
  });
});
