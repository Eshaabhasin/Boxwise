import { rupeesToPaise } from "@/lib/calc/money";
import { toMm, isLengthUnit, type LengthUnit } from "@/lib/calc/units";
import { getField, type FieldDef, type FieldKey, type SpecValue } from "@/lib/fields";
import { numbersIn } from "@/lib/nlp/normalize";

/**
 * Checks and converts what the LLM returned, field by field. A value is kept
 * only if it is the right type AND was actually said: every number must be in
 * the dictated text, every option must have one of its spoken words there,
 * every name word must appear. Anything else is dropped with a reason.
 * The rate is never accepted from a request (golden rule 3).
 */

export interface Dropped {
  field: string;
  value: string;
  reason: string;
}

export interface GuardedRequest {
  /** Customer fields (company, phone...), as text. */
  customer: Partial<Record<FieldKey, string>>;
  /** Card fields in storage form: lengths in mm, everything per lib/fields.ts. */
  specs: Partial<Record<FieldKey, SpecValue>>;
  /** Size as spoken when no unit was said, so the plan can ask for it. */
  sizeWithoutUnit: { length?: number; breadth?: number; height?: number } | null;
  dropped: Dropped[];
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** True if `phrase` appears in `text` as whole words. */
function hasPhrase(text: string, phrase: string): boolean {
  const t = ` ${words(text).join(" ")} `;
  const p = words(phrase).join(" ");
  return p.length > 0 && t.includes(` ${p} `);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}

function show(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function numberWasSaid(n: number, text: string, field: FieldDef): boolean {
  if (numbersIn(text).has(n)) return true;
  const implied = field.impliedNumbers?.[n];
  return implied?.some((p) => hasPhrase(text, p)) ?? false;
}

/** "18", "18.50", or "18 rupees 50 paise" all justify 18.5. */
function moneyWasSaid(rupees: number, text: string): boolean {
  if (numbersIn(text).has(rupees)) return true;
  for (const m of text.matchAll(/(\d+)\s+(?:rupees?|rupaye|rupaiye|rs)\s+(\d{1,2})\s+paise/gi)) {
    if (Number(m[1]) + Number(m[2]) / 100 === rupees) return true;
  }
  return false;
}

function matchOption(field: FieldDef, raw: string, text: string): string | { reason: string } {
  const options = field.options ?? [];
  const lowerRaw = raw.trim().toLowerCase();
  const option =
    options.find((o) => o.toLowerCase() === lowerRaw) ??
    options.find((o) => field.optionAliases?.[o]?.some((a) => a.toLowerCase() === lowerRaw));
  if (!option) return { reason: `not one of ${options.join(", ")}` };
  const spoken = [option, ...(field.optionAliases?.[option] ?? [])];
  // Single letters (flute "B") only count with their aliases ("B flute"), never alone.
  const evidence = spoken.filter((s) => s.length > 1 || !field.optionAliases);
  if (!evidence.some((s) => hasPhrase(text, s))) return { reason: "not heard in what you said" };
  return option;
}

/**
 * @param fields  the LLM's "fields" object
 * @param text    the normalized dictated text (all utterances for a corrected plan)
 * @param opts.defaultUnit  unit for sides said without one (an edit uses the card's unit)
 * @param opts.allowRate    true only for the owner's own "set rate" command
 */
export function guardRequestFields(
  fields: Record<string, unknown>,
  text: string,
  opts: { defaultUnit?: LengthUnit; allowRate?: boolean } = {},
): GuardedRequest {
  const out: GuardedRequest = { customer: {}, specs: {}, sizeWithoutUnit: null, dropped: [] };
  const drop = (field: string, value: unknown, reason: string) =>
    out.dropped.push({ field, value: show(value), reason });
  const spokenSides: Partial<Record<"length" | "breadth" | "height", number>> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === "" || value === undefined) continue;
    const field = getField(key);
    if (!field) {
      drop(key, value, "not a field BoxBol knows");
      continue;
    }
    if (field.ownerOnly && !opts.allowRate) {
      drop(key, value, "the rate is only set when you say it as your rate for a card");
      continue;
    }
    const k = field.key as FieldKey;

    switch (field.kind) {
      case "text": {
        const s = String(value).trim();
        const ws = words(s);
        const said = ws.filter((w) => hasPhrase(text, w)).length;
        // Names must be fully heard; longer free text (addresses) mostly heard.
        const needed = field.onCustomer && k !== "address" ? ws.length : Math.ceil(ws.length * 0.7);
        if (ws.length === 0 || said < needed) drop(key, value, "not heard in what you said");
        else if (field.onCustomer) out.customer[k] = s;
        else out.specs[k] = s;
        break;
      }
      case "phone": {
        let digits = String(value).replace(/\D/g, "");
        if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
        if (digits.length !== 10) drop(key, value, "a phone number needs 10 digits");
        else if (!text.replace(/\D/g, "").includes(digits)) drop(key, value, "not heard in what you said");
        else out.customer[k] = digits;
        break;
      }
      case "gstin": {
        const g = String(value).replace(/\s/g, "").toUpperCase();
        if (!GSTIN.test(g)) drop(key, value, "not a valid 15-character GST number");
        else if (!text.replace(/\s/g, "").toUpperCase().includes(g)) drop(key, value, "not heard in what you said");
        else out.customer[k] = g;
        break;
      }
      case "enum": {
        const m = matchOption(field, String(value), text);
        if (typeof m === "string") out.specs[k] = m;
        else drop(key, value, m.reason);
        break;
      }
      case "int":
      case "kg":
      case "percent":
      case "length": {
        const n = toNumber(value);
        if (n === null || n < 0) {
          drop(key, value, "not a number");
        } else if (field.kind === "int" && !Number.isInteger(n)) {
          drop(key, value, "must be a whole number");
        } else if (field.options && !field.options.includes(String(n))) {
          drop(key, value, `must be one of ${field.options.join(", ")}`);
        } else if (field.kind === "percent" && n > 28) {
          drop(key, value, "GST can't be above 28%");
        } else if (!numberWasSaid(n, text, field)) {
          drop(key, value, "this number was not in what you said");
        } else if (field.kind === "length") {
          spokenSides[k as "length" | "breadth" | "height"] = n;
        } else {
          out.specs[k] = n;
        }
        break;
      }
      case "money": {
        const n = toNumber(value);
        if (n === null || n <= 0) drop(key, value, "not an amount");
        else if (!moneyWasSaid(n, text)) drop(key, value, "this amount was not in what you said");
        else out.specs[k] = rupeesToPaise(n);
        break;
      }
    }
  }

  // Code converts the size to millimetres, using the unit he said (or the card's unit for an edit).
  const unit = isLengthUnit(out.specs.dimUnit) ? out.specs.dimUnit : opts.defaultUnit;
  const sides = Object.keys(spokenSides).length > 0;
  if (sides && isLengthUnit(unit)) {
    for (const [side, n] of Object.entries(spokenSides)) out.specs[side as FieldKey] = toMm(n, unit);
  } else if (sides) {
    out.sizeWithoutUnit = spokenSides;
  }
  return out;
}
