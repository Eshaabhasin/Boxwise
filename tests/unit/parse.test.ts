import { describe, expect, it } from "vitest";
import type { ChatMessage, LlmClient } from "@/lib/nlp/llm";
import { parseRequest } from "@/lib/nlp/parse";

/** A stand-in LLM that returns scripted replies and records what it was asked. */
function fakeLlm(...replies: string[]): LlmClient & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  return {
    provider: "fake",
    model: "fake",
    calls,
    async complete(messages) {
      calls.push(messages);
      return replies.shift() ?? "{}";
    },
  };
}

const SAID = "Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print";
const GOOD = JSON.stringify({
  intent: "create_request",
  fields: { company: "Sharma Packaging", quantity: 500, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2 },
  unclear: [],
});

describe("parse pipeline", () => {
  it("sends normalized text and returns guarded storage values", async () => {
    const llm = fakeLlm(GOOD);
    const r = await parseRequest(SAID, llm);
    expect(llm.calls[0]?.at(-1)?.content).toBe(
      "Screen: new quote\nSaid: Sharma Packaging 500 box 12 by 10 by 8 inch 5 ply 30 kilo load 2 colour print",
    );
    expect(r.error).toBeNull();
    expect(r.request?.specs.length).toBe(304.8);
    expect(r.request?.dropped).toEqual([]);
  });

  it("retries once on invalid JSON, then succeeds", async () => {
    const llm = fakeLlm("sure! here you go", GOOD);
    const r = await parseRequest(SAID, llm);
    expect(llm.calls).toHaveLength(2);
    expect(r.request?.customer.company).toBe("Sharma Packaging");
  });

  it("gives up after two bad replies", async () => {
    const r = await parseRequest(SAID, fakeLlm("nope", '{"intent":"maybe"}'));
    expect(r.error).toMatch(/twice/);
    expect(r.request).toBeNull();
  });

  it("reports an LLM outage as an error, not a crash", async () => {
    const llm: LlmClient = { provider: "fake", model: "fake", complete: () => Promise.reject(new Error("503 overloaded")) };
    const r = await parseRequest(SAID, llm);
    expect(r.error).toBe("503 overloaded");
  });

  it("sends a correction with the earlier request and checks values against both", async () => {
    const corrected = JSON.stringify({
      intent: "create_request",
      fields: { company: "Sharma Packaging", quantity: 600, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2, flute: "B" },
      unclear: [],
    });
    const llm = fakeLlm(corrected);
    const earlier = "Sharma Packaging 500 box 12 by 10 by 8 inch 5 ply 30 kilo load 2 colour print";
    const r = await parseRequest("nahi chhe sau box aur B flute", llm, earlier);
    expect(llm.calls[0]?.at(-1)?.content).toBe(`Screen: new quote\nSaid: Earlier: ${earlier}. Correction: nahi 600 box aur B flute`);
    expect(r.request?.specs.quantity).toBe(600);
    expect(r.request?.specs.flute).toBe("B");
  });

  it("drops a value the model invented", async () => {
    const invented = JSON.stringify({ intent: "create_request", fields: { company: "Sharma Packaging", style: "RSC" }, unclear: [] });
    const r = await parseRequest(SAID, fakeLlm(invented));
    expect(r.request?.specs.style).toBeUndefined();
    expect(r.request?.dropped.map((d) => d.field)).toEqual(["style"]);
  });
});
