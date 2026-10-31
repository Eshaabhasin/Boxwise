import { describe, expect, it } from "vitest";
import { planSections } from "@/lib/commands/plan-sections";

describe("sorting a plan for the screen", () => {
  it("splits details, working and the bill", () => {
    const s = planSections([
      "Customer: Gupta Foods (already in your list)",
      "Box 1: Inner carton · 4 × 3 × 4 inch · 1,000 pcs · @ ₹10.30",
      "GST %: 5%",
      "Not said: Colour",
      "Box 1: formula: Sheet 16 × 11.25 in = 180 sq in · Board 180 × 0.035 = ₹6.30",
      "Box 1: 1,000 × ₹10.30 = ₹10,300.00",
      "Cutting die (one-time) for box 1: ₹2,500.00",
      "CGST 2.5% + SGST 2.5%: ₹2,189.00",
      "Round off: -₹0.50",
      "Total: ₹45,969.00",
    ]);
    expect(s.details.map((d) => d.label)).toEqual(["Customer", "Box 1", "GST %"]);
    expect(s.notSaid).toBe("Colour");
    expect(s.working).toEqual([{ label: "Box 1", steps: ["Sheet 16 × 11.25 in = 180 sq in", "Board 180 × 0.035 = ₹6.30"] }]);
    expect(JSON.stringify(s.bill)).not.toContain("0.035");
    expect(s.bill).toEqual([
      { label: "Box 1 · 1,000 × ₹10.30", amount: "₹10,300.00" },
      { label: "Cutting die (one-time) for box 1", amount: "₹2,500.00", total: false },
      { label: "CGST 2.5% + SGST 2.5%", amount: "₹2,189.00", total: false },
      { label: "Round off", amount: "-₹0.50", total: false },
      { label: "Total", amount: "₹45,969.00", total: true },
    ]);
  });

  it("reads the approval plan and leaves a change as a detail", () => {
    const s = planSections(["Carton box, 3 ply: 1,000 × ₹20.75 = ₹20,750.00", "Total with 5% GST: ₹31,763.00", "Rate per box: ₹18.00 → ₹21.00", "It gets its number when you approve. Nothing is sent yet."]);
    expect(s.bill.map((b) => b.label)).toEqual(["Carton box, 3 ply · 1,000 × ₹20.75", "Total with 5% GST"]);
    expect(s.details).toEqual([
      { label: "Rate per box", value: "₹18.00 → ₹21.00" },
      { label: "", value: "It gets its number when you approve. Nothing is sent yet." },
    ]);
  });
});
