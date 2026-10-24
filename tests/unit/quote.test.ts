import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/calc/money";
import { QUOTE_FIELDS, buildQuoteSnapshot, financialYear, itemDetail, itemTitle, missingFor, quoteNumber, whatsappMessage } from "@/lib/quote/build";
import type { Specs } from "@/lib/fields";

const SHARMA: Specs = {
  company: "Sharma Packaging",
  length: 304.8,
  breadth: 254,
  height: 203.2,
  dimUnit: "inch",
  ply: 5,
  loadKg: 30,
  quantity: 500,
  printColours: 2,
  ratePerBox: 1800,
  gstPercent: 18,
  deliveryTime: "10 days",
  paymentTerms: "50 percent advance",
};

describe("quotation snapshot", () => {
  it("matches the reference quotation", () => {
    const q = buildQuoteSnapshot(SHARMA, "27");
    expect(q.totals.subtotalPaise).toBe(900000);
    expect(q.totals.gstPaise).toBe(162000);
    expect(formatINR(q.totals.totalPaise)).toBe("₹10,620.00");
    expect(q.gstMode).toBe("intra");
    expect(q.itemTitle).toBe("Corrugated box, 5 ply");
    expect(q.itemDetail).toBe("12 × 10 × 8 in · 30 kg load · 2-colour print");
    expect(q.terms.validity).toBe("—");
  });

  it("charges IGST to a customer in another state", () => {
    expect(buildQuoteSnapshot({ ...SHARMA, gstin: "07AAPFU0939F1ZV" }, "27").gstMode).toBe("inter");
  });

  it("keeps customer fields out of the spec snapshot", () => {
    const q = buildQuoteSnapshot({ ...SHARMA, address: "Bhiwandi" }, "27");
    expect(q.specsSnapshot.address).toBeUndefined();
    expect(q.customerSnapshot.address).toBe("Bhiwandi");
  });

  it("refuses without a rate (never invents one)", () => {
    const { ratePerBox, ...noRate } = SHARMA;
    void ratePerBox;
    expect(() => buildQuoteSnapshot(noRate, "27")).toThrow(/rate/);
  });

  it("says what is still needed before approval", () => {
    expect(missingFor(SHARMA, QUOTE_FIELDS)).toEqual(["validity"]);
  });
});

describe("item description", () => {
  it("names the style when it is not RSC", () => {
    expect(itemTitle({ ply: 7, style: "Die-cut" })).toBe("Corrugated Die-cut box, 7 ply");
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
  it("pads the sequence", () => {
    expect(quoteNumber("BB", "2026-27", 7)).toBe("BB/2026-27/0007");
  });
});

describe("WhatsApp message", () => {
  it("is written from the card", () => {
    const q = buildQuoteSnapshot(SHARMA, "27");
    expect(whatsappMessage({ ...q, totalPaise: q.totals.totalPaise }, "BB/2026-27/0001", "Your Company")).toBe(
      "Namaste Sharma Packaging ji, aapki request (500 boxes, 12 × 10 × 8 inch, 5 ply, 30 kg load) ka quotation BB/2026-27/0001 attached hai. Rate ₹18.00 per box + 18% GST, total ₹10,620.00. Delivery 10 days, payment 50 percent advance. Dhanyavaad, Your Company",
    );
  });
});
