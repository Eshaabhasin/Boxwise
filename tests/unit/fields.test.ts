import { describe, expect, it } from "vitest";
import { FIELDS, FIELD_KEYS, getField, missingFields } from "@/lib/fields";

describe("fields config", () => {
  it("has unique keys", () => {
    expect(new Set(FIELD_KEYS).size).toBe(FIELD_KEYS.length);
  });

  it("gives every enum field its options", () => {
    for (const f of FIELDS) {
      if (f.kind === "enum") expect("options" in f && f.options.length > 0, f.key).toBe(true);
    }
  });

  it("marks only the rate as owner-only", () => {
    const ownerOnly = FIELDS.filter((f) => "ownerOnly" in f && f.ownerOnly).map((f) => f.key);
    expect(ownerOnly).toEqual(["ratePerBox"]);
  });

  it("flags the spec example's missing fields", () => {
    // "Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print"
    const missing = missingFields(
      {
        company: "Sharma Packaging",
        quantity: 500,
        length: 304.8,
        breadth: 254,
        height: 203.2,
        dimUnit: "inch",
        ply: 5,
        loadKg: 30,
        printColours: 2,
      },
      "card",
    );
    expect(missing.sort()).toEqual(["address", "flute", "joint", "style"]);
  });

  it("adds rate and terms only at quote time", () => {
    const missing = missingFields({}, "quote");
    expect(missing).toContain("ratePerBox");
    expect(missingFields({}, "card")).not.toContain("ratePerBox");
  });

  it("treats 0 colours (plain) as answered", () => {
    expect(missingFields({ printColours: 0 }, "card")).not.toContain("printColours");
  });

  it("looks fields up by key", () => {
    expect(getField("ply")?.label).toBe("Ply");
    expect(getField("nope")).toBeUndefined();
  });
});
