import { guardRequestFields, type GuardedRequest } from "@/lib/nlp/guard";
import type { LlmClient } from "@/lib/nlp/llm";
import { normalize } from "@/lib/nlp/normalize";
import { buildMessages, correctionText } from "@/lib/nlp/prompt";
import { LlmRequestOutput } from "@/lib/nlp/schemas";

/**
 * The whole "dictated text -> card fields" pipeline:
 *   normalize (code) -> LLM (language only) -> zod -> guard (code) -> storage values (code)
 * No database here, so the test harness runs exactly this.
 */

export interface ParseResult {
  /** Normalized text of this utterance. */
  normalized: string;
  /** All text the values may come from (earlier utterances + this one). */
  heardText: string;
  intent: "create_request" | "other" | null;
  /** Raw reply(ies) from the LLM, for parseLogs. */
  llmRaw: string;
  llmParsed: LlmRequestOutput | null;
  request: GuardedRequest | null;
  unclear: string[];
  error: string | null;
  latencyMs: number;
}

function tryParse(raw: string): { ok: true; value: LlmRequestOutput } | { ok: false; issue: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, issue: "the reply was not valid JSON" };
  }
  const parsed = LlmRequestOutput.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, issue: `${first?.path.join(".") || "reply"}: ${first?.message ?? "invalid"}` };
  }
  return { ok: true, value: parsed.data };
}

/**
 * @param text     what was just dictated
 * @param llm      the LLM client
 * @param earlier  normalized text of the plan being corrected, if any
 */
export async function parseRequest(text: string, llm: LlmClient, earlier?: string): Promise<ParseResult> {
  const started = Date.now();
  const normalized = normalize(text);
  const heardText = earlier ? `${earlier} ${normalized}` : normalized;
  const messages = buildMessages(earlier ? correctionText(earlier, normalized) : normalized);

  const raws: string[] = [];
  let parsed: LlmRequestOutput | null = null;
  let error: string | null = null;
  try {
    const first = await llm.complete(messages);
    raws.push(first);
    let attempt = tryParse(first);
    if (!attempt.ok) {
      // One retry, telling the model what was wrong.
      const second = await llm.complete([
        ...messages,
        { role: "assistant", content: first },
        { role: "user", content: `That reply was not usable (${attempt.issue}). Reply with only the JSON object.` },
      ]);
      raws.push(second);
      attempt = tryParse(second);
    }
    if (attempt.ok) parsed = attempt.value;
    else error = `The language model gave an unusable answer twice (${attempt.issue}).`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const request = parsed && parsed.intent === "create_request" ? guardRequestFields(parsed.fields, heardText) : null;
  return {
    normalized,
    heardText,
    intent: parsed?.intent ?? null,
    llmRaw: raws.join("\n---retry---\n"),
    llmParsed: parsed,
    request,
    unclear: parsed?.unclear ?? [],
    error,
    latencyMs: Date.now() - started,
  };
}
