import { describe, expect, it } from "vitest";
import { aiCounterName, aiDailyLimit, isProviderDailyLimit } from "@/lib/commands/ai-limit";

describe("the daily AI limit", () => {
  it("is 60 unless set to a whole number", () => {
    expect(aiDailyLimit(undefined)).toBe(60);
    expect(aiDailyLimit("abc")).toBe(60);
    expect(aiDailyLimit("0")).toBe(60);
    expect(aiDailyLimit("100")).toBe(100);
  });
  it("starts again at midnight in India", () => {
    expect(aiCounterName(new Date("2026-10-31T18:29:00Z"))).toBe("ai:2026-10-31");
    expect(aiCounterName(new Date("2026-10-31T18:31:00Z"))).toBe("ai:2026-11-01");
  });
  it("spots Groq's own daily limit", () => {
    expect(isProviderDailyLimit("429 Rate limit reached on tokens per day (TPD)")).toBe(true);
    expect(isProviderDailyLimit("429 tokens per minute")).toBe(false);
  });
});
