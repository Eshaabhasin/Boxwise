import { describe, expect, it } from "vitest";
import { formatSize, fromMm, toMm } from "@/lib/calc/units";

describe("unit conversion", () => {
  it("converts to millimetres", () => {
    expect(toMm(12, "inch")).toBe(304.8);
    expect(toMm(30, "cm")).toBe(300);
    expect(toMm(450, "mm")).toBe(450);
    expect(toMm(8.5, "inch")).toBe(215.9);
  });

  it("round-trips back to the spoken unit", () => {
    for (const v of [12, 10, 8, 8.5, 14.25, 0.5]) {
      expect(fromMm(toMm(v, "inch"), "inch")).toBe(v);
      expect(fromMm(toMm(v, "cm"), "cm")).toBe(v);
    }
  });

  it("formats L × B × H", () => {
    expect(formatSize(304.8, 254, 203.2, "inch")).toBe("12 × 10 × 8 IN");
    expect(formatSize(450, 300, 250, "mm")).toBe("450 × 300 × 250 MM");
    expect(formatSize(304.8, null, 203.2, "inch")).toBeNull();
  });
});
