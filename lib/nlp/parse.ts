import type { LengthUnit } from "@/lib/calc/units";
import { guardRequestFields, type GuardedRequest } from "@/lib/nlp/guard";
import type { LlmClient } from "@/lib/nlp/llm";
import { normalize } from "@/lib/nlp/normalize";
import { buildMessages, correctionText, type Screen } from "@/lib/nlp/prompt";
import { LlmCommandOutput, type Intent } from "@/lib/nlp/schemas";

/**
 * The whole "dictated text -> structured command" pipeline:
 *   normalize (code) -> LLM (language only) -> zod -> guard (code) -> storage values (code)
 * No database here, so the test harness runs exactly this.
 */

export interface ParseOptions {
  /** Where it was said, e.g. "new quote", "board", "card REQ-001 Sharma Packaging". */
  screen?: Screen;
  /** Company of the card on screen: a target naming it is the same as no target. */
  screenCompany?: string;
  /** Normalized text of the plan being corrected, if any. */
  earlier?: string;
  /** Unit to use for a size side said without one (the card's own unit, for edits). */
  defaultUnit?: LengthUnit;
}

export interface ParseResult {
  /** Normalized text of this utterance. */
  normalized: string;
  /** All text the values may come from (earlier utterances + this one). */
  heardText: string;
  intent: Intent | null;
  /** The LLM's answer after zod, target checked against the text. */
  command: LlmCommandOutput | null;
  /** Raw reply(ies) from the LLM, for parseLogs. */
  llmRaw: string;
  /** Field values after the guard, for create_request and edit_request. */
  request: GuardedRequest | null;
  unclear: string[];
  error: string | null;
  latencyMs: number;
}

function tryParse(raw: string): { ok: true; value: LlmCommandOutput } | { ok: false; issue: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, issue: "the reply was not valid JSON" };
  }
  const parsed = LlmCommandOutput.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, issue: `${first?.path.join(".") || "reply"}: ${first?.message ?? "invalid"}` };
  }
  return { ok: true, value: parsed.data };
}

function wordsOf(s: string): string[] {
  return s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** A target ("Sharma Packaging", "REQ 2") is only kept if its words were said. */
function targetWasSaid(target: string, text: string): boolean {
  const said = new Set(wordsOf(text));
  return wordsOf(target).every((w) => said.has(w) || /^req$/.test(w));
}

export async function parseCommand(text: string, llm: LlmClient, opts: ParseOptions = {}): Promise<ParseResult> {
  const started = Date.now();
  const normalized = normalize(text);
  const heardText = opts.earlier ? `${opts.earlier} ${normalized}` : normalized;
  const said = opts.earlier ? correctionText(opts.earlier, normalized) : normalized;
  const messages = buildMessages(said, opts.screen ?? "new quote");

  const raws: string[] = [];
  let command: LlmCommandOutput | null = null;
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
    if (attempt.ok) command = attempt.value;
    else error = `The language model gave an unusable answer twice (${attempt.issue}).`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const unclear = [...(command?.unclear ?? [])];
  if (command?.target && !targetWasSaid(command.target, heardText)) {
    // The model often names the card on screen; that is what no target means anyway, so no warning.
    const sameAsScreen = opts.screenCompany && wordsOf(command.target).join(" ") === wordsOf(opts.screenCompany).join(" ");
    if (!sameAsScreen) unclear.push(`ignored card name “${command.target}”, it was not in what you said`);
    command = { ...command, target: null };
  }

  const hasFields = command && ["create_request", "edit_request", "set_rate"].includes(command.intent);
  const request =
    hasFields && command
      ? guardRequestFields(command.fields, heardText, { defaultUnit: opts.defaultUnit, allowRate: command.intent === "set_rate" })
      : null;
  return {
    normalized,
    heardText,
    intent: command?.intent ?? null,
    command,
    llmRaw: raws.join("\n---retry---\n"),
    request,
    unclear,
    error,
    latencyMs: Date.now() - started,
  };
}

/** A new request dictated on the Start a quotation screen (what the harness tests). */
export function parseRequest(text: string, llm: LlmClient, earlier?: string): Promise<ParseResult> {
  return parseCommand(text, llm, { screen: "new quote", earlier });
}
