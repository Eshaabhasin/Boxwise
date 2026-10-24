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

describe("box card view", () => {
  it("shows the spec example the way the PDF does", () => {
    const view = buildCardView({
      id: "x",
      number: 16,
      customerName: "Sharma Packaging",
      stage: "New",
      specs: { length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, loadKg: 30, quantity: 500, printColours: 2 },
      missing: ["flute", "style", "joint", "address"],
    });
    expect(view.ref).toBe("REQ-016");
    expect(view.size).toBe("12 × 10 × 8 IN");
    expect(view.ply).toBe("5");
    expect(view.load).toBe("30 KG");
    expect(view.quantity).toBe("500");
    expect(view.print).toBe("2-colour");
    expect(view.missing).toEqual(["Flute", "Style", "Joint", "Address"]);
    expect(view.waitingOn).toBe("Customer info");
  });

  it("collapses missing sides into one Size tag and shows plain print", () => {
    const view = buildCardView({
      id: "y",
      customerName: "X",
      stage: "New",
      specs: { printColours: 0, quantity: 1000 },
      missing: ["length", "breadth", "height"],
    });
    expect(view.missing).toEqual(["Size"]);
    expect(view.size).toBeNull();
    expect(view.print).toBe("Plain");
    expect(view.quantity).toBe("1,000");
  });
});
