import { formatSize, fromMm, isLengthUnit } from "@/lib/calc/units";
import { formatINR } from "@/lib/calc/money";
import {
  CUSTOMER_FIELD_KEYS,
  FIELD_DEFS,
  getField,
  missingFields,
  scopeOf,
  type FieldKey,
  type SpecValue,
  type Specs,
  type Stage,
} from "@/lib/fields";

/**
 * A card (one customer enquiry) as plain data: the customer's fields, the
 * boxes asked for, and the quotation-level terms. No database here.
 */

export interface Box {
  id: string;
  specs: Specs;
}

export interface CardState {
  /** "REQ-016" */
  ref: string;
  stage: Stage;
  /** Customer fields (company, contact, phone, GSTIN, address). */
  customer: Specs;
  boxes: Box[];
  /** GST % and terms. */
  terms: Specs;
}

/** "REQ-016" */
export function requestRef(number: number | undefined): string {
  return number ? `REQ-${String(number).padStart(3, "0")}` : "REQ";
}

/** "Sharma Packaging" -> "sharma packaging"; used to match a customer said twice. */
export function companyKey(company: string): string {
  return (company.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

/** Short random id for a box ("b7k2x9"). */
export function newBoxId(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(random() * 31)]).join("");
}

export function boxLabel(index: number): string {
  return `Box ${index + 1}`;
}

/** Per-box fields still unsaid. */
export function boxMissing(specs: Specs): FieldKey[] {
  return missingFields(specs, "card").filter((k) => {
    const f = getField(k);
    return f !== undefined && scopeOf(f) === "item";
  });
}

/** Card-level gaps: customer fields, plus any field that one or more boxes are missing. */
export function cardMissing(customer: Specs, boxes: readonly { specs: Specs }[]): FieldKey[] {
  const out = new Set<FieldKey>(
    missingFields(customer, "card").filter((k) => CUSTOMER_FIELD_KEYS.includes(k)),
  );
  if (boxes.length === 0) out.add("quantity");
  for (const b of boxes) for (const k of boxMissing(b.specs)) out.add(k);
  // Keep the order of lib/fields.ts.
  return FIELD_DEFS.map((f) => f.key as FieldKey).filter((k) => out.has(k));
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** One value as people read it: "9 inch", "2-colour", "₹18.00", "1,500". */
export function display(key: FieldKey, value: SpecValue | undefined, specs: Specs): string {
  if (value === undefined || value === null) return "—";
  const f = getField(key);
  if (f?.kind === "length" && typeof value === "number") {
    const unit = isLengthUnit(specs.dimUnit) ? specs.dimUnit : "mm";
    return `${fromMm(value, unit)} ${unit}`;
  }
  if (key === "printColours") return value === 0 ? "plain (no print)" : `${value}-colour`;
  if (key === "loadKg") return `${value} kg`;
  if (key === "quantity" && typeof value === "number") return value.toLocaleString("en-IN");
  if (key === "gstPercent") return `${value}%`;
  if (f?.kind === "money" && typeof value === "number") return formatINR(value);
  return String(value);
}

/** "12 × 10 × 8 inch", or null. */
export function sizeText(specs: Specs): string | null {
  const unit = isLengthUnit(specs.dimUnit) ? specs.dimUnit : "mm";
  const s = formatSize(num(specs.length), num(specs.breadth), num(specs.height), unit);
  return s ? s.replace(/ IN$/, " inch").replace(/ MM$/, " mm").replace(/ CM$/, " cm") : null;
}

/** "12 × 10 × 8 inch · 5 ply · B flute · 30 kg · 2-colour · 500 pcs" */
export function boxSummary(specs: Specs): string {
  const parts: string[] = [];
  if (typeof specs.boxType === "string") parts.push(specs.boxType === "Inner carton" && specs.board === "SBS" ? "Inner carton (SBS)" : specs.boxType);
  const size = sizeText(specs);
  if (size) parts.push(typeof specs.sizeType === "string" ? `${size} ${specs.sizeType.toLowerCase()}` : size);
  if (num(specs.ply)) parts.push(`${specs.ply} ply`);
  if (typeof specs.colour === "string") parts.push(specs.colour.toLowerCase());
  if (typeof specs.flute === "string") parts.push(`${specs.flute} flute`);
  if (typeof specs.style === "string") parts.push(specs.style);
  if (num(specs.loadKg)) parts.push(`${specs.loadKg} kg`);
  const colours = num(specs.printColours);
  if (colours !== null && colours > 0) parts.push(`${colours}-colour`);
  else if (specs.print === "Multi-colour") parts.push("multi-colour");
  else if (colours === 0 || specs.print === "Plain") parts.push("plain");
  if (specs.coating === "Lamination") parts.push("laminated");
  else if (specs.coating === "None") parts.push("no lamination");
  else if (typeof specs.coating === "string") parts.push(specs.coating.toLowerCase());
  if (typeof specs.joint === "string") parts.push(specs.joint.toLowerCase());
  if (specs.cutting === "Slitter") parts.push("slitter");
  if (specs.artwork === "We design") parts.push("we design");
  if (num(specs.quantity)) parts.push(`${(specs.quantity as number).toLocaleString("en-IN")} pcs`);
  if (num(specs.ratePerBox)) parts.push(`@ ${formatINR(specs.ratePerBox as number)}`);
  return parts.join(" · ") || "no details yet";
}

/** Everything on the card in one bag, for the PDF/GST code that needs customer + terms together. */
export function customerAndTerms(card: Pick<CardState, "customer" | "terms">): Specs {
  return { ...card.terms, ...card.customer };
}

/** A box's one-line summary, split for a card: type and size, the rest, and the rate. */
export function splitSummary(summary: string): { title: string; details: string; rate: string | null } {
  const parts = summary.split(" · ");
  const rate = parts.find((p) => p.startsWith("@ "))?.slice(2) ?? null;
  const rest = parts.filter((p) => !p.startsWith("@ "));
  const sizeAt = rest.findIndex((p) => / × /.test(p));
  const title = rest.slice(0, sizeAt + 1).join(" · ") || (rest.shift() ?? "");
  return { title, details: rest.slice(sizeAt + 1).join(" · "), rate };
}
