import { boxLabel, type CardState } from "@/lib/card";
import type { CardEdit, NewCard } from "@/lib/commands/changes";
import { formatINR } from "@/lib/calc/money";
import type { FieldKey, SpecValue, Specs } from "@/lib/fields";
import { describeGaps, priceBox } from "@/lib/pricing/formula";
import type { PricingRates } from "@/lib/pricing/rates";

/**
 * Puts the formula's rate and one-time charges on each box of a plan, so he
 * sees them before "approve". A value he says himself ("rate 21", "die charge
 * 4000", or typed on the quotation) is his: the formula leaves it alone from
 * then on and only says what it would have been. Pure.
 */

export const PRICE_KEYS = ["ratePerBox", "dieCharge", "designCharge"] as const satisfies readonly FieldKey[];
type PriceKey = (typeof PRICE_KEYS)[number];

export function lockedKeys(specs: Specs): Set<PriceKey> {
  const raw = typeof specs.ownerSet === "string" ? specs.ownerSet.split(" ") : [];
  return new Set(PRICE_KEYS.filter((k) => raw.includes(k)));
}

function setLocked(specs: Specs, locked: Set<PriceKey>): void {
  if (locked.size === 0) delete specs.ownerSet;
  else specs.ownerSet = PRICE_KEYS.filter((k) => locked.has(k)).join(" ");
}

export interface PricedBox {
  specs: Specs;
  /** How the rate was worked out (one line), shown on the plan only. */
  lines: string[];
  warnings: string[];
}

/**
 * One box, priced. `said` is what he set in this command: a price key in it
 * becomes his own value.
 */
export function withFormula(specs: Specs, rates: PricingRates, said: Specs, name = ""): PricedBox {
  const out: Specs = { ...specs };
  const locked = lockedKeys(specs);
  for (const k of PRICE_KEYS) if (said[k] !== undefined && said[k] !== null) locked.add(k);
  const lines: string[] = [];
  const warnings: string[] = [];
  const prefix = name ? `${name}: ` : "";

  const r = priceBox(out, rates);
  if (!r.ok) {
    if ("problem" in r) warnings.push(prefix + r.problem);
    else if (!locked.has("ratePerBox")) warnings.push(`${prefix}for the formula rate, still say: ${describeGaps(r.missing)}.`);
    setLocked(out, locked);
    return { specs: out, lines, warnings };
  }

  const computed: Record<PriceKey, number> = { ratePerBox: r.ratePaise, dieCharge: r.dieChargePaise, designCharge: r.designChargePaise };
  for (const k of PRICE_KEYS) {
    if (locked.has(k)) continue;
    if (computed[k] > 0) out[k] = computed[k];
    else delete out[k];
  }
  lines.push(`${prefix}formula: ${r.steps.join(" · ")}`);
  if (locked.has("ratePerBox") && out.ratePerBox !== r.ratePaise) {
    warnings.push(`${prefix}your rate ${typeof out.ratePerBox === "number" ? formatINR(out.ratePerBox) : ""} is kept; the formula gives ${formatINR(r.ratePaise)}.`.replace("  ", " "));
  }
  if (r.assumed.length) warnings.push(`${prefix}assumed ${r.assumed.join("; ")}.`);
  setLocked(out, locked);
  return { specs: out, lines, warnings };
}

function gstDefault(terms: Specs, rates: PricingRates, priced: boolean): Specs {
  if (!priced || (terms.gstPercent !== undefined && terms.gstPercent !== null)) return {};
  return { gstPercent: rates.defaultGstPercent };
}

function hasRate(specs: Specs): boolean {
  return typeof specs.ratePerBox === "number";
}

/** A new enquiry with each box priced, and GST at your usual rate unless he said one. */
export function priceNewCard(card: NewCard, rates: PricingRates): { card: NewCard; lines: string[]; warnings: string[] } {
  const lines: string[] = [];
  const warnings: string[] = [];
  const many = card.boxes.length > 1;
  const boxes = card.boxes.map((specs, i) => {
    const p = withFormula(specs, rates, specs, many ? boxLabel(i) : "");
    lines.push(...p.lines);
    warnings.push(...p.warnings);
    return p.specs;
  });
  const terms = { ...card.terms, ...gstDefault(card.terms, rates, boxes.some(hasRate)) };
  return { card: { ...card, boxes, terms }, lines, warnings };
}

function changedPriceValues(before: Specs, after: Specs): Specs {
  const out: Specs = {};
  for (const k of [...PRICE_KEYS, "ownerSet"] as const) {
    const a: SpecValue | undefined = before[k];
    const b: SpecValue | undefined = after[k];
    if ((a ?? null) !== (b ?? null)) out[k] = b ?? null;
  }
  return out;
}

/** An edit with the boxes it touches priced again. Boxes it doesn't touch keep their price. */
export function priceEdit(card: CardState, edit: CardEdit, rates: PricingRates): { edit: CardEdit; lines: string[]; warnings: string[] } {
  const lines: string[] = [];
  const warnings: string[] = [];
  const kept = card.boxes.filter((b) => !edit.remove.includes(b.id));
  const many = kept.length + edit.add.length > 1;

  const set = edit.set.map((s) => {
    const box = card.boxes.find((b) => b.id === s.id);
    if (!box) return s;
    const merged: Specs = { ...box.specs };
    for (const [k, v] of Object.entries(s.values) as [FieldKey, SpecValue][]) {
      if (v === null) delete merged[k];
      else merged[k] = v;
    }
    const p = withFormula(merged, rates, s.values, many ? boxLabel(kept.findIndex((b) => b.id === s.id)) : "");
    lines.push(...p.lines);
    warnings.push(...p.warnings);
    return { id: s.id, values: { ...s.values, ...changedPriceValues(merged, p.specs) } };
  });
  const add = edit.add.map((specs, i) => {
    const p = withFormula(specs, rates, specs, many ? boxLabel(kept.length + i) : "");
    lines.push(...p.lines);
    warnings.push(...p.warnings);
    return p.specs;
  });
  const priced = set.some((s) => typeof s.values.ratePerBox === "number") || add.some(hasRate) || card.boxes.some((b) => hasRate(b.specs));
  const terms = { ...edit.terms, ...gstDefault({ ...card.terms, ...edit.terms }, rates, priced) };
  return { edit: { ...edit, set, add, terms }, lines, warnings };
}

/**
 * Boxes after an edit typed on the quotation: a rate or charge typed different
 * from before becomes his; the rest follow the formula again (quantity changed, say).
 */
export function repriceTyped(before: CardState, after: CardState, rates: PricingRates): CardState {
  const boxes = after.boxes.map((b) => {
    const old = before.boxes.find((x) => x.id === b.id);
    const said: Specs = {};
    for (const k of PRICE_KEYS) {
      if (old && (old.specs[k] ?? null) !== (b.specs[k] ?? null)) said[k] = b.specs[k] ?? 0;
    }
    if (!old) for (const k of PRICE_KEYS) if (b.specs[k] !== undefined) said[k] = b.specs[k] ?? 0;
    return { ...b, specs: withFormula(b.specs, rates, said).specs };
  });
  return { ...after, boxes };
}
