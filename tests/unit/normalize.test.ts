import { describe, expect, it } from "vitest";
import { normalize, numbersIn } from "@/lib/nlp/normalize";

describe("Hinglish number words", () => {
  it.each([
    ["paanch sau box", "500 box"],
    ["barah by das by aath inch", "12 by 10 by 8 inch"],
    ["paanch ply", "5 ply"],
    ["tees kilo load", "30 kilo load"],
    ["bees kilo", "20 kilo"],
    ["do colour print", "2 colour print"],
    ["do hazaar box", "2000 box"],
    ["dhai hazaar", "2500"],
    ["dedh sau", "150"],
    ["saade aath inch", "8.5 inch"],
    ["paune nau", "8.75"],
    ["teen sau pachas", "350"],
    ["ek lakh", "100000"],
    ["5 sau box", "500 box"],
    ["2 hazaar 5 sau", "2500"],
    ["paanch sau barah", "512"],
    ["paanch sau barah by das by aath", "500 12 by 10 by 8"],
    ["do hazaar 12 by 10", "2000 12 by 10"],
  ])("%s -> %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe("English number words", () => {
  it.each([
    ["five hundred boxes", "500 boxes"],
    ["twelve by ten by eight inch", "12 by 10 by 8 inch"],
    ["two thousand five hundred", "2500"],
    ["two hundred and fifty boxes", "250 boxes"],
    ["twenty five kg", "25 kg"],
    ["eight point five inch", "8.5 inch"],
    ["a thousand boxes", "a 1000 boxes"],
  ])("%s -> %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe("words that are not always numbers", () => {
  it("keeps 'kar do' as a verb", () => {
    expect(normalize("height 9 inch kar do")).toBe("height 9 inch kar do");
  });
  it("keeps 'tera' meaning 'your'", () => {
    expect(normalize("tera box ready hai")).toBe("tera box ready hai");
  });
  it("keeps 'saath' meaning 'with'", () => {
    expect(normalize("printing ke saath")).toBe("printing ke saath");
  });
  it("reads 'saath box' as 60", () => {
    expect(normalize("saath box")).toBe("60 box");
  });
  it("keeps 'bara box' (big box) but reads 'bara by' and 'by bara' as 12", () => {
    expect(normalize("bara box")).toBe("bara box");
    expect(normalize("bara by 10")).toBe("12 by 10");
    expect(normalize("10 by bara")).toBe("10 by 12");
  });
});

describe("numbers typed with commas (user report: “quantity is 1,000” was not read)", () => {
  // Regression: Wispr Flow types "1,000"; the guard saw 1 and 0 and dropped quantity 1000.
  it.each([
    ["quantity is 1,000", "quantity is 1000"],
    ["10,000 box", "10000 box"],
    ["1,00,000 box", "100000 box"],
    ["2,50,000", "250000"],
    ["1,234,567", "1234567"],
    ["rate 1,250.50", "rate 1250.50"],
  ])("%s -> %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it("leaves two numbers separated by a comma alone", () => {
    expect(normalize("12,10 box")).toBe("12,10 box");
  });

  it("lets the guard accept the quantity", () => {
    expect([...numbersIn(normalize("quantity is 1,000"))]).toEqual([1000]);
  });
});

describe("dictation clean-up", () => {
  it("splits 12x10x8 and glued units", () => {
    expect(normalize("12x10x8 inch 5ply 30kg")).toBe("12 by 10 by 8 inch 5 ply 30 kg");
  });
  it("drops fillers and keeps corrections", () => {
    expect(normalize("uh 500 box um nahi 600 box")).toBe("500 box nahi 600 box");
  });
  it("leaves a GSTIN intact", () => {
    expect(normalize("gst number 27AAPFU0939F1ZV")).toBe("gst number 27AAPFU0939F1ZV");
  });
  it("keeps punctuation attached", () => {
    expect(normalize("Sharma Packaging, paanch sau box.")).toBe("Sharma Packaging, 500 box.");
  });
  it("runs the spec example end to end", () => {
    expect(
      normalize("Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print"),
    ).toBe("Sharma Packaging 500 box 12 by 10 by 8 inch 5 ply 30 kilo load 2 colour print");
  });
});

describe("numbersIn", () => {
  it("lists every number", () => {
    expect([...numbersIn("500 box 12 by 10 by 8.5 inch")]).toEqual([500, 12, 10, 8.5]);
  });
});
