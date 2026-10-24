import { describe, expect, it } from "vitest";
import { guardRequestFields } from "@/lib/nlp/guard";
import { normalize } from "@/lib/nlp/normalize";
import { FEW_SHOTS } from "@/lib/nlp/prompt";
import { LlmRequestOutput } from "@/lib/nlp/schemas";

const SHARMA = normalize(
  "Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print",
);

describe("guard keeps what was said", () => {
  it("accepts the spec example and converts the size to mm", () => {
    const g = guardRequestFields(
      { company: "Sharma Packaging", quantity: 500, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2 },
      SHARMA,
    );
    expect(g.dropped).toEqual([]);
    expect(g.customer).toEqual({ company: "Sharma Packaging" });
    expect(g.specs).toEqual({ quantity: 500, length: 304.8, breadth: 254, height: 203.2, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2 });
  });

  it("accepts 'plain' as 0 colours", () => {
    const g = guardRequestFields({ printColours: 0 }, normalize("2000 box plain"));
    expect(g.specs.printColours).toBe(0);
  });
});

describe("guard drops what was not said (golden rule 2)", () => {
  it("drops an invented flute", () => {
    const g = guardRequestFields({ flute: "B" }, SHARMA);
    expect(g.specs.flute).toBeUndefined();
    expect(g.dropped[0]?.field).toBe("flute");
  });

  it("does not accept a lone letter as a flute", () => {
    expect(guardRequestFields({ flute: "B" }, normalize("plan b please")).specs.flute).toBeUndefined();
    expect(guardRequestFields({ flute: "B" }, normalize("5 ply b flute")).specs.flute).toBe("B");
  });

  it("drops a number that was not in the text", () => {
    const g = guardRequestFields({ loadKg: 25 }, SHARMA);
    expect(g.specs.loadKg).toBeUndefined();
  });

  it("drops a company name with extra words", () => {
    const g = guardRequestFields({ company: "Sharma Packaging Pvt Ltd" }, SHARMA);
    expect(g.customer.company).toBeUndefined();
  });

  it("drops an invented style and joint", () => {
    const g = guardRequestFields({ style: "RSC", joint: "Glued" }, SHARMA);
    expect(g.specs).toEqual({});
    expect(g.dropped).toHaveLength(2);
  });

  it("drops a ply that is not 3, 5 or 7", () => {
    expect(guardRequestFields({ ply: 4 }, normalize("4 ply")).specs.ply).toBeUndefined();
  });

  it("drops unknown keys", () => {
    expect(guardRequestFields({ colour: "red" }, "red").dropped[0]?.reason).toMatch(/not a field/);
  });
});

describe("guard never takes a rate (golden rule 3)", () => {
  it("drops ratePerBox even when the number was said", () => {
    const g = guardRequestFields({ ratePerBox: 12 }, normalize("rate 12 rupees"));
    expect(g.specs.ratePerBox).toBeUndefined();
    expect(g.dropped[0]?.field).toBe("ratePerBox");
  });
});

describe("size units", () => {
  it("keeps the spoken size aside when no unit was said", () => {
    const g = guardRequestFields({ length: 12, breadth: 10, height: 8 }, normalize("12 by 10 by 8"));
    expect(g.specs.length).toBeUndefined();
    expect(g.sizeWithoutUnit).toEqual({ length: 12, breadth: 10, height: 8 });
  });

  it("converts mm and cm", () => {
    const g = guardRequestFields({ length: 45, breadth: 30, height: 25, dimUnit: "cm" }, normalize("45 by 30 by 25 cm"));
    expect([g.specs.length, g.specs.breadth, g.specs.height]).toEqual([450, 300, 250]);
  });
});

describe("customer fields", () => {
  it("keeps a phone and GSTIN only when said", () => {
    const text = normalize("phone 98765 43210 gst 27AAPFU0939F1ZV");
    const g = guardRequestFields({ phone: "+91 9876543210", gstin: "27aapfu0939f1zv" }, text);
    expect(g.customer).toEqual({ phone: "9876543210", gstin: "27AAPFU0939F1ZV" });
    expect(guardRequestFields({ phone: "9999999999" }, text).customer.phone).toBeUndefined();
  });

  it("rejects a malformed GSTIN", () => {
    expect(guardRequestFields({ gstin: "27ABC" }, "27ABC").dropped[0]?.reason).toMatch(/valid/);
  });
});

describe("prompt examples agree with the guard", () => {
  it.each(FEW_SHOTS.map(([input, output]) => [input, output] as const))("%s", (input, output) => {
    const parsed = LlmRequestOutput.parse(output);
    if (parsed.intent !== "create_request") return;
    const text = input.replace(/^Earlier: /, "").replace(/\. Correction: /, " ");
    const g = guardRequestFields(parsed.fields, normalize(text));
    expect(g.dropped).toEqual([]);
  });
});
