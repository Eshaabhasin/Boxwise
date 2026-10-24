import { describe, expect, it } from "vitest";
import { computeTotals, formatINR, gstModeFor, rupeesToPaise } from "@/lib/calc/money";

describe("totals", () => {
  it("matches the reference quotation (500 × ₹18 + 18%)", () => {
    const t = computeTotals({ quantity: 500, ratePaise: 1800, gstPercent: 18, mode: "intra" });
    expect(t.subtotalPaise).toBe(900000);
    expect(t.cgstPaise).toBe(81000);
    expect(t.sgstPaise).toBe(81000);
    expect(t.gstPaise).toBe(162000);
    expect(t.totalPaise).toBe(1062000);
    expect(formatINR(t.totalPaise)).toBe("₹10,620.00");
  });

  it("charges IGST across states", () => {
    const t = computeTotals({ quantity: 500, ratePaise: 1800, gstPercent: 18, mode: "inter" });
    expect(t.igstPaise).toBe(162000);
    expect(t.cgstPaise + t.sgstPaise).toBe(0);
  });

  it("rounds each tax line half up in paise", () => {
    // 7 × ₹12.35 = ₹86.45; 9% of 8645 paise = 778.05 → 778
    const t = computeTotals({ quantity: 7, ratePaise: 1235, gstPercent: 18, mode: "intra" });
    expect(t.cgstPaise).toBe(778);
    expect(t.totalPaise).toBe(8645 + 778 * 2);
  });

  it("rounds to the rupee when asked and records the round-off", () => {
    const t = computeTotals({ quantity: 7, ratePaise: 1235, gstPercent: 18, mode: "intra", roundToRupee: true });
    expect(t.totalPaise % 100).toBe(0);
    expect(t.totalPaise - t.roundOffPaise).toBe(8645 + 1556);
  });

  it("rejects nonsense", () => {
    expect(() => computeTotals({ quantity: 0, ratePaise: 100, gstPercent: 18, mode: "intra" })).toThrow();
    expect(() => computeTotals({ quantity: 5, ratePaise: 10.5, gstPercent: 18, mode: "intra" })).toThrow();
  });
});

describe("money helpers", () => {
  it("converts spoken rupees to paise without float drift", () => {
    expect(rupeesToPaise(18)).toBe(1800);
    expect(rupeesToPaise(0.29)).toBe(29);
    expect(rupeesToPaise(12.75)).toBe(1275);
  });

  it("formats in Indian grouping", () => {
    expect(formatINR(1234567890)).toBe("₹1,23,45,678.90");
    expect(formatINR(5)).toBe("₹0.05");
  });

  it("picks GST mode from the GSTIN state code", () => {
    expect(gstModeFor("27AAAAA0000A1Z5", "27")).toBe("intra");
    expect(gstModeFor("07AAAAA0000A1Z5", "27")).toBe("inter");
    expect(gstModeFor(undefined, "27")).toBe("intra");
  });
});
