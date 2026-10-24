import { describe, expect, it } from "vitest";
import { fastCommand } from "@/lib/commands/fastpath";
import { buildCreatePlan, companyKey } from "@/lib/commands/plan";
import { guardRequestFields } from "@/lib/nlp/guard";
import { normalize } from "@/lib/nlp/normalize";

describe("fast commands", () => {
  it.each([
    ["approve", "approve"],
    ["Approve.", "approve"],
    ["haan theek hai", "approve"],
    ["ok ji", "approve"],
    ["approve kar do please", "approve"],
    ["cancel", "cancel"],
    ["rehne do", "cancel"],
    ["undo", "undo"],
    ["wapas karo", "undo"],
  ])("%s -> %s", (text, cmd) => {
    expect(fastCommand(text)).toBe(cmd);
  });

  it.each([
    "Sharma Packaging 500 box approve",
    "ok 600 box",
    "nahi 600 box",
    "",
  ])("is not a control word: %s", (text) => {
    expect(fastCommand(text)).toBeNull();
  });
});

describe("company key", () => {
  it("matches the same company said differently", () => {
    expect(companyKey("Sharma Packaging")).toBe(companyKey("sharma  packaging."));
  });
});

describe("create plan", () => {
  const text = normalize("Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print");
  const guarded = guardRequestFields(
    { company: "Sharma Packaging", quantity: 500, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2, flute: "C" },
    text,
  );

  it("lists what will be saved and what was not said", () => {
    const plan = buildCreatePlan(guarded, [], null);
    expect(plan.title).toBe("New box card for Sharma Packaging");
    expect(plan.lines).toContain("Customer: Sharma Packaging (new customer)");
    expect(plan.lines).toContain("Size: 12 × 10 × 8 inch");
    expect(plan.lines).toContain("Quantity: 500");
    expect(plan.lines).toContain("Printing (colours): 2-colour");
    expect(plan.lines.at(-1)).toBe("Not said: Address, Box style, Flute, Joint");
  });

  it("warns about the invented flute it left out", () => {
    const plan = buildCreatePlan(guarded, [], null);
    expect(plan.warnings.some((w) => w.includes("Flute") && w.includes("not heard"))).toBe(true);
  });

  it("does not flag the address of a known customer", () => {
    const plan = buildCreatePlan(guarded, [], { company: "Sharma Packaging", address: "Bhiwandi" });
    expect(plan.lines).toContain("Customer: Sharma Packaging (already in your list)");
    expect(plan.lines.at(-1)).not.toContain("Address");
  });

  it("builds the preview card", () => {
    const plan = buildCreatePlan(guarded, [], null);
    expect(plan.card.size).toBe("12 × 10 × 8 IN");
    expect(plan.card.waitingOn).toBe("Customer info");
  });

  it("asks for a unit when the size has none", () => {
    const g = guardRequestFields({ company: "X Co", length: 12, breadth: 10, height: 8 }, normalize("X Co 12 by 10 by 8"));
    expect(buildCreatePlan(g, [], null).warnings[0]).toMatch(/has no unit/);
  });
});
