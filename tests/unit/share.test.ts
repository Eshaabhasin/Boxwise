import { describe, expect, it } from "vitest";
import { fastCommand } from "@/lib/commands/fastpath";
import { copyableSpecs } from "@/lib/commands/repeat";
import { pdfFileName, publicPdfUrl, textWithPdfLink, waLink, waPhone } from "@/lib/quote/share";

describe("WhatsApp links", () => {
  it("adds India's code to a 10-digit number", () => {
    expect(waPhone("98765 43210")).toBe("919876543210");
    expect(waPhone("+91 98765 43210")).toBe("919876543210");
    expect(waPhone(undefined)).toBeNull();
    expect(waPhone("12345")).toBeNull();
  });

  it("builds a wa.me link with the text encoded", () => {
    expect(waLink("9876543210", "Namaste ji, total ₹10,620.00")).toBe(
      "https://wa.me/919876543210?text=Namaste%20ji%2C%20total%20%E2%82%B910%2C620.00",
    );
  });

  it("lets WhatsApp ask for the chat when there is no phone", () => {
    expect(waLink(undefined, "hi")).toBe("https://wa.me/?text=hi");
  });

  it("puts the PDF link under the message", () => {
    const url = publicPdfUrl("https://boxbol.example.com/", "abc123");
    expect(url).toBe("https://boxbol.example.com/q/abc123");
    expect(textWithPdfLink("Namaste", url)).toBe("Namaste\n\nQuotation PDF: https://boxbol.example.com/q/abc123");
  });

  it("names PDF files without slashes", () => {
    expect(pdfFileName("BB/2026-27/0001")).toBe("Quotation-BB-2026-27-0001.pdf");
  });
});

describe("send by voice", () => {
  it.each(["bhej do", "send", "WhatsApp kar do", "share karo please"])("%s", (said) => {
    expect(fastCommand(said)).toBe("send");
  });
  it("does not send from a long sentence", () => {
    expect(fastCommand("Sharma ko kal bhej do quotation")).toBeNull();
  });
});

describe("same as last time", () => {
  it("copies the box and quantity but never the rate or terms", () => {
    const copied = copyableSpecs({
      company: "Sharma Packaging",
      address: "Bhiwandi",
      length: 304.8,
      breadth: 254,
      height: 203.2,
      dimUnit: "inch",
      ply: 5,
      flute: "B",
      quantity: 500,
      ratePerBox: 1800,
      gstPercent: 18,
      deliveryTime: "10 days",
      paymentTerms: "50 percent advance",
      validity: "15 din",
    });
    expect(copied).toEqual({ length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, flute: "B", quantity: 500 });
  });
});
