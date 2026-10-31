import { describe, expect, it } from "vitest";
import { checklistFromUnderstood, checklistState, understoodFrom } from "@/lib/checklist";

describe("the New quote checklist", () => {
  it("ticks what was said", () => {
    const s = checklistState("Gupta Foods, carton box, 12 by 10 by 8 inch, 5 ply, brown, 2 colour print, no lamination, 1,000 piece");
    expect(s).toMatchObject({ boxType: "heard", size: "heard", ply: "heard", colour: "heard", print: "heard", lamination: "heard", quantity: "heard", design: "todo", cutting: "todo" });
  });

  it("leaves the rest to do", () => {
    expect(checklistState("Sharma ke liye 10 x 6 x 4")).toMatchObject({ size: "heard", boxType: "todo", ply: "todo", quantity: "todo" });
  });

  it("does not ask ply or colour for an inner carton", () => {
    expect(checklistState("inner carton 4 by 3 by 4 multicolour laminated 1000 pcs")).toMatchObject({ boxType: "heard", ply: "not needed", colour: "not needed", print: "heard", lamination: "heard", quantity: "heard" });
  });
});

describe("ply said the other way round", () => {
  it.each(["The ply is 3.", "ply: 5", "ply 7"])("%s", (said) => {
    expect(checklistState(said).ply).toBe("heard");
  });
});

describe("ticks from what GPT understood", () => {
  it("ticks an item only when every box has it", () => {
    const u = understoodFrom([
      { boxType: "Carton", length: 254, breadth: 152.4, height: 101.6, ply: 3, colour: "Brown", printColours: 2, coating: "None", quantity: 1000 },
      { boxType: "Carton", length: 254, breadth: 152.4, height: 101.6, ply: 3, print: "Plain", coating: "None", quantity: 500 },
    ]);
    expect(u.keys).toEqual(["boxType", "size", "ply", "print", "lamination", "quantity"]);
    expect(checklistFromUnderstood(u)).toMatchObject({ colour: "todo", design: "todo" });
  });
  it("strikes ply and colour for inner cartons", () => {
    expect(checklistFromUnderstood(understoodFrom([{ boxType: "Inner carton", quantity: 1000 }]))).toMatchObject({ ply: "not needed", colour: "not needed", quantity: "heard", size: "todo" });
  });
});
