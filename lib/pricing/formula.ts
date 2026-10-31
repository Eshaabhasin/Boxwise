import { formatINR } from "@/lib/calc/money";
import { fromMm } from "@/lib/calc/units";
import { getField, type BoxType, type FieldKey, type Specs } from "@/lib/fields";
import type { PricingRates, Slab } from "@/lib/pricing/rates";

/**
 * The price of one box from your formula. Pure code, no LLM (golden rule 1):
 *
 *   sheet       Carton        (L + B + 1) × 2  by  H + B + 1
 *               Self-lock     2B + 3H + 1      by  L + ½B + 3H
 *               Inner carton  (L + B + 1) × 2  by  H + B + 2 + ¾B
 *   board       sheet area × rate (by ply, or duplex / SBS); white +10%
 *   printing    the slab's charge for the whole order ÷ quantity
 *   lamination  sheet area ÷ 250, only on sheets up to 28 × 40
 *   one-time    die (die-cut only) and design (only when we make it)
 *
 * Sizes are L × B × H in inches. Money comes out in paise, rounded once at the end.
 */

export interface Sheet {
  /** The two sides, inches, as the formula gives them. */
  a: number;
  b: number;
  area: number;
}

export type PriceResult =
  | {
      ok: true;
      sheet: Sheet;
      slab: string;
      ratePaise: number;
      dieChargePaise: number;
      designChargePaise: number;
      /** How it was worked out, one step at a time, for the plan only. */
      steps: string[];
      /** Defaults it used that he can change by saying so. */
      assumed: string[];
    }
  | { ok: false; missing: FieldKey[] }
  | { ok: false; problem: string };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Rupees (any fraction) to paise, rounded half up. */
function paise(rupees: number): number {
  return Math.round(rupees * 100 + 1e-9);
}

function inches(mm: number): number {
  return fromMm(mm, "inch");
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function sheetFor(type: BoxType, l: number, b: number, h: number): Sheet {
  let a: number;
  let w: number;
  if (type === "Carton") {
    a = (l + b + 1) * 2;
    w = h + b + 1;
  } else if (type === "Self-lock") {
    a = 2 * b + 3 * h + 1;
    w = l + b / 2 + 3 * h;
  } else {
    a = (l + b + 1) * 2;
    w = h + b + 2 + (3 / 4) * b;
  }
  return { a, b: w, area: a * w };
}

function fits(sheet: Sheet, maxShort: number, maxLong: number): boolean {
  return Math.min(sheet.a, sheet.b) <= maxShort && Math.max(sheet.a, sheet.b) <= maxLong;
}

/** The smallest band the sheet fits; the last band takes anything bigger. */
export function slabFor(sheet: Sheet, slabs: readonly Slab[]): Slab {
  const found = slabs.find((s) => s.maxShort === null || s.maxLong === null || fits(sheet, s.maxShort, s.maxLong));
  return found ?? (slabs[slabs.length - 1] as Slab);
}

/** Printing for the whole order: the slab's charge per batch of sheets, never below the minimum. */
export function printingCost(slab: Slab, sheets: number): number {
  return (slab.printCost * Math.max(sheets, slab.printMinSheets)) / slab.printPerSheets;
}

function isPrinted(specs: Specs): boolean | null {
  if (specs.print === "Multi-colour") return true;
  if (specs.print === "Plain") return false;
  const colours = num(specs.printColours);
  return colours === null ? null : colours > 0;
}

function label(k: FieldKey): string {
  return getField(k)?.label ?? k;
}

/** What this box still needs before the formula can price it. */
export function pricingGaps(specs: Specs): FieldKey[] {
  const need: FieldKey[] = [];
  const type = specs.boxType;
  if (typeof type !== "string") need.push("boxType");
  for (const k of ["length", "breadth", "height"] as const) if (num(specs[k]) === null) need.push(k);
  if (type !== "Inner carton") {
    if (num(specs.ply) === null) need.push("ply");
    if (typeof specs.colour !== "string") need.push("colour");
  }
  if (isPrinted(specs) === null) need.push("print");
  if (typeof specs.coating !== "string") need.push("coating");
  if (num(specs.quantity) === null) need.push("quantity");
  return need;
}

export function priceBox(specs: Specs, rates: PricingRates): PriceResult {
  const missing = pricingGaps(specs);
  if (missing.length > 0) return { ok: false, missing };
  const type = specs.boxType as BoxType;
  const l = inches(num(specs.length) ?? 0);
  const b = inches(num(specs.breadth) ?? 0);
  const h = inches(num(specs.height) ?? 0);
  const quantity = num(specs.quantity) ?? 0;
  const steps: string[] = [];
  const assumed: string[] = [];

  const sheet = sheetFor(type, l, b, h);
  const slab = slabFor(sheet, rates.slabs);
  const band = slab.maxShort === null ? `bigger than ${rates.slabs[rates.slabs.length - 2]?.name ?? "the others"}` : `fits ${slab.name}`;
  steps.push(`Sheet ${trim(sheet.a)} × ${trim(sheet.b)} in = ${trim(sheet.area)} sq in (${band})`);

  // Board
  let rate: number;
  let rateName: string;
  if (type === "Inner carton") {
    const board = specs.board === "SBS" ? "SBS" : "Duplex";
    if (specs.board !== "SBS" && specs.board !== "Duplex") assumed.push("duplex board (say “SBS” for SBS)");
    rate = rates.inner[board];
    rateName = `${board} 350 GSM`;
  } else {
    const ply = num(specs.ply);
    if (ply !== 3 && ply !== 5 && ply !== 7) return { ok: false, problem: `There is no rate for ${ply} ply. Say 3, 5 or 7 ply.` };
    rate = (type === "Carton" ? rates.carton : rates.selfLock)[ply];
    rateName = `${ply} ply`;
  }
  let board = sheet.area * rate;
  steps.push(`Board (${rateName}): ${trim(sheet.area)} × ${rate} = ${formatINR(paise(board))}`);
  if (type !== "Inner carton" && specs.colour === "White") {
    board *= 1 + rates.whiteExtraPercent / 100;
    steps.push(`White +${rates.whiteExtraPercent}% = ${formatINR(paise(board))}`);
  }

  // Printing
  const printed = isPrinted(specs) === true;
  let printing = 0;
  if (printed) {
    const order = printingCost(slab, quantity);
    printing = order / quantity;
    const minimum = quantity < slab.printMinSheets ? ` (minimum ${slab.printMinSheets.toLocaleString("en-IN")} sheets)` : "";
    steps.push(`Print: ${formatINR(paise(order))}${minimum} ÷ ${quantity.toLocaleString("en-IN")} = ${formatINR(paise(printing))}`);
  }

  // Lamination
  let lamination = 0;
  if (specs.coating === "Lamination") {
    if (!fits(sheet, rates.laminationMaxShort, rates.laminationMaxLong)) {
      return {
        ok: false,
        problem: `Lamination is only possible up to ${rates.laminationMaxShort} × ${rates.laminationMaxLong} in, and this box needs a ${trim(sheet.a)} × ${trim(sheet.b)} in sheet. Say “no lamination” or a smaller size.`,
      };
    }
    lamination = sheet.area / rates.laminationDivisor;
    steps.push(`Lamination: ${trim(sheet.area)} ÷ ${rates.laminationDivisor} = ${formatINR(paise(lamination))}`);
  } else if (specs.coating === "Varnish" || specs.coating === "Wax") {
    assumed.push(`${String(specs.coating).toLowerCase()} is not in the formula, so nothing is added for it`);
  }

  const ratePaise = paise(board + printing + lamination);
  steps.push(`Rate per box: ${formatINR(ratePaise)}`);

  // One-time charges
  let dieChargePaise = 0;
  if (specs.cutting === "Slitter") steps.push("Cutting: slitter, no die");
  else if (specs.cutting === "Existing die") steps.push("Cutting: existing die, no die charge");
  else {
    dieChargePaise = paise(slab.die);
    steps.push(`Die (one-time): ${formatINR(dieChargePaise)}`);
    if (specs.cutting !== "Die") assumed.push("die-cut (say “slitter” if the party agrees)");
  }
  let designChargePaise = 0;
  if (printed) {
    if (specs.artwork === "We design") {
      designChargePaise = paise(slab.design);
      steps.push(`Design (one-time): ${formatINR(designChargePaise)}`);
    } else if (specs.artwork !== "Customer's" && specs.artwork !== "Existing") {
      assumed.push(`the party sends the design (say “design hum banayenge” to add ${formatINR(paise(slab.design))})`);
    }
  }
  return { ok: true, sheet, slab: slab.name, ratePaise, dieChargePaise, designChargePaise, steps, assumed };
}

/** "Box type, ply, quantity" for a message. */
export function describeGaps(keys: readonly FieldKey[]): string {
  return keys.map(label).join(", ");
}
