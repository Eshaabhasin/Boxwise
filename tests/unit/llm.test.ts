import { beforeEach, describe, expect, it } from "vitest";
import { buildMessages, systemPrompt } from "@/lib/nlp/prompt";
import { createLlm, resetFallbackState, shouldFallBack, withFallback, type LlmClient } from "@/lib/nlp/llm";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function fake(model: string, behave: () => Promise<string>): LlmClient & { calls: number } {
  const c = {
    provider: "fake",
    model,
    calls: 0,
    async complete() {
      c.calls += 1;
      return behave();
    },
  };
  return c;
}

const DAILY = new HttpError(429, "Rate limit reached for model on tokens per day (TPD): Limit 200000");

describe("backup model", () => {
  beforeEach(() => resetFallbackState());

  it("uses the main model when it answers", async () => {
    const main = fake("big", async () => "{}");
    const backup = fake("small", async () => "{}");
    const llm = withFallback(main, backup);
    await llm.complete([]);
    expect([main.calls, backup.calls, llm.model]).toEqual([1, 0, "big"]);
  });

  it("switches to the backup on the daily limit and stays there for a while", async () => {
    let t = 0;
    const main = fake("big", () => Promise.reject(DAILY));
    const backup = fake("small", async () => '{"intent":"other"}');
    const llm = withFallback(main, backup, () => t);
    expect(await llm.complete([])).toBe('{"intent":"other"}');
    expect(llm.model).toBe("small");
    t += 60_000;
    await llm.complete([]);
    expect(main.calls).toBe(1); // not asked again while benched
    t += 11 * 60_000;
    await llm.complete([]).catch(() => undefined);
    expect(main.calls).toBe(2); // tried again after the pause
  });

  it("switches on an outage", async () => {
    const llm = withFallback(fake("big", () => Promise.reject(new HttpError(503, "over capacity"))), fake("small", async () => "ok"));
    expect(await llm.complete([])).toBe("ok");
  });

  it("does not switch on a wrong API key or a bad request (the backup would fail too)", async () => {
    const backup = fake("small", async () => "ok");
    const llm = withFallback(fake("big", () => Promise.reject(new HttpError(401, "Invalid API Key"))), backup);
    await expect(llm.complete([])).rejects.toThrow("Invalid API Key");
    expect(backup.calls).toBe(0);
  });

  it("knows which errors are worth a switch", () => {
    expect(shouldFallBack(DAILY)).toBe(true);
    expect(shouldFallBack(new Error("The model `x` does not exist or you do not have access to it."))).toBe(true);
    expect(shouldFallBack(new HttpError(400, "bad request"))).toBe(false);
  });

  it("is off when asked (the harness measures the main model alone)", () => {
    const llm = createLlm({ GROQ_API_KEY: "test", GROQ_MODEL: "big" }, { fallback: false });
    expect(llm.model).toBe("big");
  });
});

describe("prompt size", () => {
  it("stays small: every command sends all of it, and Groq's free tier counts tokens", () => {
    const chars = buildMessages("Sharma Packaging 500 box", "new quote")
      .map((m) => m.content)
      .join("\n").length;
    // About 3.6 characters per token: 10,500 characters is roughly 2,900 tokens.
    expect(chars).toBeLessThan(10500);
    expect(systemPrompt()).toContain("ratePerBox");
  });

  it("says that '5000 box' is a quantity, not a number of boxes (harness 07-inner-e-flute)", () => {
    // Regression: after multi-box support, gpt-oss-120b dropped "5000 box" from
    // "... 3 ply E flute 5000 box ..." three runs out of three, reading it as a count of boxes.
    expect(systemPrompt()).toMatch(/"<number> box \/ boxes \/ piece \/ pcs \/ nag" is the quantity/);
  });
});
