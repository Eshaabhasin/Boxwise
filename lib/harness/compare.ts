import { z } from "zod";
import { fromMm, isLengthUnit } from "@/lib/calc/units";
import { getField, missingFields, type FieldKey, type SpecValue, type Specs } from "@/lib/fields";
import type { GuardedRequest } from "@/lib/nlp/guard";

/**
 * Compares the card the pipeline made with the card a request should make.
 * Every expected field must match, and any other field is a failure too:
 * a value nobody said is an invented value (golden rule 2).
 */

export const HarnessCase = z.object({
  id: z.string(),
  said: z.string(),
  expect: z.record(z.string(), z.union([z.string(), z.number()])),
  missing: z.array(z.string()).optional(),
});
export type HarnessCase = z.infer<typeof HarnessCase>;

export const HarnessFile = z.object({
  about: z.string().optional(),
  requests: z.array(HarnessCase).min(1),
});

/** A card in the units it was spoken in (sizes back from mm), for comparing with the expected card. */
export function spokenCard(g: GuardedRequest): Record<string, SpecValue> {
  const card: Record<string, SpecValue> = { ...g.customer };
  const unit = isLengthUnit(g.specs.dimUnit) ? g.specs.dimUnit : null;
  for (const [k, v] of Object.entries(g.specs) as [FieldKey, SpecValue][]) {
    if (v === undefined) continue;
    card[k] = getField(k)?.kind === "length" && typeof v === "number" && unit ? fromMm(v, unit) : v;
  }
  if (g.sizeWithoutUnit) Object.assign(card, g.sizeWithoutUnit);
  return card;
}

function words(v: unknown): string {
  return (String(v).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

function same(key: string, expected: string | number, actual: SpecValue): boolean {
  if (actual === null || actual === undefined) return false;
  if (typeof expected === "number") return typeof actual === "number" && Math.abs(actual - expected) < 0.01;
  // Text compares on its words: "Plot 45, Wagle Estate" equals "plot 45 wagle estate".
  if (key === "phone" || key === "gstin") return String(actual).replace(/\W/g, "").toUpperCase() === expected.replace(/\W/g, "").toUpperCase();
  return words(actual) === words(expected);
}

export interface CaseResult {
  id: string;
  pass: boolean;
  /** True when the LLM service failed (rate limit, outage): says nothing about how well requests are read. */
  serviceError?: boolean;
  problems: string[];
}

/** Rate limits and outages are the service's problem, not a misread request. */
export function isServiceError(error: string): boolean {
  return /\b(429|5\d\d)\b|rate limit|timed? ?out|ECONN|ENOTFOUND|fetch failed/i.test(error);
}

/** Groq's daily limit: nothing more will run until it resets, so stop asking. */
export function isDailyLimit(error: string): boolean {
  return /tokens per day|\bTPD\b|requests per day|\bRPD\b/i.test(error);
}

export function compareCase(c: HarnessCase, g: GuardedRequest | null, error: string | null): CaseResult {
  if (error || !g) {
    const problem = error ?? "no card was made";
    return { id: c.id, pass: false, serviceError: isServiceError(problem), problems: [problem] };
  }
  const actual = spokenCard(g);
  const problems: string[] = [];
  for (const [k, want] of Object.entries(c.expect)) {
    const got = actual[k];
    if (got === undefined) problems.push(`${k}: expected ${JSON.stringify(want)}, got nothing`);
    else if (!same(k, want, got)) problems.push(`${k}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
  for (const [k, got] of Object.entries(actual)) {
    if (!(k in c.expect)) problems.push(`${k}: not said, but the card has ${JSON.stringify(got)}`);
  }
  for (const d of g.dropped) {
    if (d.field in c.expect) problems.push(`${d.field}: dropped “${d.value}” (${d.reason})`);
  }
  if (c.missing) {
    const want = [...c.missing].sort();
    const got = missingFields({ ...g.specs, ...g.customer } as Specs, "card").sort();
    if (want.join(",") !== got.join(",")) problems.push(`missing: expected [${want.join(", ")}], got [${got.join(", ")}]`);
  }
  return { id: c.id, pass: problems.length === 0, problems };
}

export interface RunSummary {
  at: string;
  model: string;
  /** Requests in tests/requests.json. */
  total: number;
  passed: number;
  /** Misread: the card was wrong. These are what to fix. */
  failed: string[];
  /** The LLM service failed (rate limit, outage) or the run stopped first. Not counted in passRate. */
  notChecked: string[];
  /** passed ÷ (passed + misread), in percent. */
  passRate: number;
  /** False when some requests were not checked, so passRate covers only part of the set. */
  complete: boolean;
  durationSec: number;
  note?: string;
}

/** results has one entry per request; undefined means the run stopped before it. */
export function summarize(
  results: readonly (CaseResult | undefined)[],
  ids: readonly string[],
  model: string,
  startedAt: Date,
  endedAt: Date,
): RunSummary {
  const checked = results.filter((r): r is CaseResult => r !== undefined && !r.serviceError);
  const passed = checked.filter((r) => r.pass).length;
  const notChecked = ids.filter((_, i) => results[i] === undefined || results[i]?.serviceError);
  return {
    at: endedAt.toISOString(),
    model,
    total: ids.length,
    passed,
    failed: checked.filter((r) => !r.pass).map((r) => r.id),
    notChecked,
    passRate: checked.length ? Math.round((passed / checked.length) * 1000) / 10 : 0,
    complete: notChecked.length === 0,
    durationSec: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
  };
}
