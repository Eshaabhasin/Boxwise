import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pdfFileName, renderQuotationPdf, type QuotationPdfData } from "@/lib/pdf/QuotationPdf";
import { buildQuoteSnapshot } from "@/lib/quote/build";

function sample(status: QuotationPdfData["status"]): QuotationPdfData {
  const snap = buildQuoteSnapshot(
    {
      company: "Sharma Packaging",
      contactPerson: "Rakesh",
      address: "Plot 12, MIDC, Bhiwandi",
      length: 304.8,
      breadth: 254,
      height: 203.2,
      dimUnit: "inch",
      ply: 5,
      flute: "B",
      loadKg: 30,
      quantity: 500,
      printColours: 2,
      joint: "Stitched",
      ratePerBox: 1800,
      gstPercent: 18,
      deliveryTime: "10 days",
      paymentTerms: "50 percent advance",
      validity: "15 din",
    },
    "27",
  );
  return {
    ...snap,
    ...snap.totals,
    number: status === "Draft" ? undefined : "BB/2026-27/0001",
    status,
    date: new Date("2026-10-24T10:00:00Z"),
  };
}

describe("quotation PDF", () => {
  it.each(["Approved", "Draft"] as const)("renders a %s quotation", async (status) => {
    const pdf = await renderQuotationPdf(sample(status));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    // Set PDF_SAMPLE_DIR to look at the result.
    if (process.env.PDF_SAMPLE_DIR) writeFileSync(`${process.env.PDF_SAMPLE_DIR}/sample-${status}.pdf`, pdf);
  }, 30_000);

  it("names the file after the number", () => {
    expect(pdfFileName("BB/2026-27/0001")).toBe("Quotation-BB-2026-27-0001.pdf");
    expect(pdfFileName(undefined)).toBe("Quotation-draft.pdf");
  });
});
