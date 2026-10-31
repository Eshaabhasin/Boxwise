import { splitSummary } from "@/lib/card";
import { describe, expect, it } from "vitest";
import { buildCardView, filterCounts, stagesFor, waitingOn } from "@/lib/board";

describe("board filters", () => {
  it("treats Pending as every open request", () => {
    expect(stagesFor("Pending")).toEqual(["New", "Quoted", "Sent"]);
    expect(stagesFor("Won")).toEqual(["Won"]);
    expect(stagesFor("All")).toHaveLength(5);
  });

  it("counts each chip from the stage counts", () => {
    const c = filterCounts({ New: 4, Quoted: 2, Sent: 3, Won: 1, Lost: 5 });
    expect(c.Pending).toBe(9);
    expect(c.New).toBe(4);
    expect(c.All).toBe(15);
  });
});

describe("waiting on", () => {
  it("asks the customer when the card has gaps", () => {
    expect(waitingOn("New", 3, false)).toBe("Customer info");
  });
  it("waits for his rate when the card is complete", () => {
    expect(waitingOn("New", 0, false)).toBe("Your rate");
  });
  it("waits for his approval once a draft PDF exists", () => {
    expect(waitingOn("New", 2, true)).toBe("Your approval");
  });
  it("follows the later stages", () => {
    expect(waitingOn("Quoted", 0, false)).toBe("Sharing");
    expect(waitingOn("Sent", 0, false)).toBe("Customer reply");
    expect(waitingOn("Won", 0, false)).toBeNull();
    expect(waitingOn("Lost", 0, false)).toBeNull();
  });
});

describe("enquiry card view", () => {
  const sharma = { length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, loadKg: 30, quantity: 500, printColours: 2 } as const;

  it("shows one line per box and the total pieces", () => {
    const view = buildCardView({
      id: "x",
      number: 16,
      customerName: "Sharma Packaging",
      stage: "New",
      boxes: [{ specs: sharma }, { specs: { length: 457.2, breadth: 304.8, height: 254, dimUnit: "inch", ply: 7, quantity: 300 } }],
      missing: ["flute", "style", "joint", "address"],
    });
    expect(view.ref).toBe("REQ-016");
    expect(view.boxCount).toBe(2);
    expect(view.boxes[0]).toEqual({ label: "Box 1", summary: "12 × 10 × 8 inch · 5 ply · 30 kg · 2-colour · 500 pcs" });
    expect(view.boxes[1]?.summary).toBe("18 × 12 × 10 inch · 7 ply · 300 pcs");
    expect(view.totalQuantity).toBe("800");
    expect(view.missing).toEqual(["Flute", "Style", "Joint", "Address"]);
    expect(view.waitingOn).toBe("Customer info");
  });

  it("shows at most three boxes but counts them all", () => {
    const view = buildCardView({ id: "y", customerName: "X", stage: "New", boxes: Array.from({ length: 5 }, () => ({ specs: { quantity: 100 } })), missing: [] });
    expect(view.boxes).toHaveLength(3);
    expect(view.boxCount).toBe(5);
    expect(view.totalQuantity).toBe("500");
  });

  it("collapses missing sides into one Size tag", () => {
    const view = buildCardView({ id: "z", customerName: "X", stage: "New", boxes: [{ specs: {} }], missing: ["length", "breadth", "height"] });
    expect(view.missing).toEqual(["Size"]);
    expect(view.totalQuantity).toBeNull();
  });
});

describe("a box on a card", () => {
  it("splits type and size, details and rate", () => {
    expect(splitSummary("Carton · 10 × 6 × 4 inch · 3 ply · white · 1,000 pcs · @ ₹20.75")).toEqual({
      title: "Carton · 10 × 6 × 4 inch",
      details: "3 ply · white · 1,000 pcs",
      rate: "₹20.75",
    });
  });
  it("copes with no size and no rate", () => {
    expect(splitSummary("Self-lock · 3 ply · brown")).toEqual({ title: "Self-lock", details: "3 ply · brown", rate: null });
  });
});
