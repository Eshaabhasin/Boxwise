import { computeTotals, formatINR, gstModeFor, type GstMode, type Totals } from "@/lib/calc/money";
import { formatSize, isLengthUnit } from "@/lib/calc/units";
import { FIELD_DEFS, type FieldKey, type Specs } from "@/lib/fields";

/**
 * Everything on a quotation, computed by code from the card and the owner's
 * spoken rate. No LLM here. The result is frozen into the quotations
 * collection, so a sent PDF can always be rebuilt exactly.
 */

/** Needed before a draft PDF can be made. */
export const DRAFT_FIELDS: readonly FieldKey[] = ["quantity", "ratePerBox", "gstPercent"];
/** Needed before the quotation can be approved. */
export const QUOTE_FIELDS: readonly FieldKey[] = FIELD_DEFS.filter((f) => f.requiredAt === "quote" || f.key === "quantity").map(
  (f) => f.key as FieldKey,
);

function has(specs: Specs, k: FieldKey): boolean {
  const v = specs[k];
  return v !== undefined && v !== null && v !== "";
}

export function missingFor(specs: Specs, keys: readonly FieldKey[]): FieldKey[] {
  return keys.filter((k) => !has(specs, k));
}

export interface QuoteSnapshot {
  customerSnapshot: { company: string; contactPerson?: string; phone?: string; gstin?: string; address?: string };
  specsSnapshot: Specs;
  quantity: number;
  ratePaise: number;
  gstPercent: number;
  gstMode: GstMode;
  totals: Totals;
  terms: { deliveryTime: string; paymentTerms: string; validity: string };
  itemTitle: string;
  itemDetail: string;
}

const NOT_SET = "—";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "Corrugated box, 5 ply" */
export function itemTitle(specs: Specs): string {
  const ply = num(specs.ply);
  const style = typeof specs.style === "string" && specs.style !== "RSC" ? ` ${specs.style}` : "";
  return `Corrugated${style} box${ply ? `, ${ply} ply` : ""}`;
}

/** "12 × 10 × 8 in (outer) · B flute · 30 kg load · 2-colour print · stitched" */
export function itemDetail(specs: Specs): string {
  const unit = isLengthUnit(specs.dimUnit) ? specs.dimUnit : "mm";
  const size = formatSize(num(specs.length), num(specs.breadth), num(specs.height), unit);
  const parts: string[] = [];
  if (size) {
    const sized = size.replace(/ IN$/, " in").replace(/ MM$/, " mm").replace(/ CM$/, " cm");
    parts.push(typeof specs.sizeType === "string" ? `${sized} (${specs.sizeType.toLowerCase()})` : sized);
  }
  if (typeof specs.flute === "string") parts.push(`${specs.flute} flute`);
  if (num(specs.gsm)) parts.push(`${specs.gsm} GSM`);
  if (num(specs.bf)) parts.push(`${specs.bf} BF`);
  if (num(specs.burstingStrength)) parts.push(`BS ${specs.burstingStrength} kg/cm²`);
  if (num(specs.loadKg)) parts.push(`${specs.loadKg} kg load`);
  const colours = num(specs.printColours);
  if (colours !== null) parts.push(colours === 0 ? "plain" : `${colours}-colour print`);
  if (typeof specs.joint === "string") parts.push(specs.joint.toLowerCase());
  if (typeof specs.coating === "string" && specs.coating !== "None") parts.push(specs.coating.toLowerCase());
  if (typeof specs.partitions === "string") parts.push(`partitions: ${specs.partitions}`);
  return parts.join(" · ");
}

/**
 * @param specs  card specs merged with customer fields; must have quantity, ratePerBox (paise), gstPercent
 */
export function buildQuoteSnapshot(specs: Specs, companyStateCode: string): QuoteSnapshot {
  const quantity = num(specs.quantity);
  const ratePaise = num(specs.ratePerBox);
  const gstPercent = num(specs.gstPercent);
  if (quantity === null || ratePaise === null || gstPercent === null) {
    throw new Error("Quantity, rate and GST are needed for a quotation");
  }
  const gstin = typeof specs.gstin === "string" ? specs.gstin : undefined;
  const gstMode = gstModeFor(gstin, companyStateCode);
  const text = (k: FieldKey) => (typeof specs[k] === "string" && specs[k] ? String(specs[k]) : undefined);

  const cardOnly: Specs = {};
  for (const f of FIELD_DEFS) {
    const k = f.key as FieldKey;
    if (!f.onCustomer && specs[k] !== undefined) cardOnly[k] = specs[k];
  }

  return {
    customerSnapshot: {
      company: text("company") ?? "",
      contactPerson: text("contactPerson"),
      phone: text("phone"),
      gstin,
      address: text("address"),
    },
    specsSnapshot: cardOnly,
    quantity,
    ratePaise,
    gstPercent,
    gstMode,
    totals: computeTotals({ quantity, ratePaise, gstPercent, mode: gstMode, roundToRupee: true }),
    terms: {
      deliveryTime: text("deliveryTime") ?? NOT_SET,
      paymentTerms: text("paymentTerms") ?? NOT_SET,
      validity: text("validity") ?? NOT_SET,
    },
    itemTitle: itemTitle(specs),
    itemDetail: itemDetail(specs),
  };
}

/** Indian financial year (April–March, India time) for a date, e.g. "2026-27". */
export function financialYear(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "BB/2026-27/0001" */
export function quoteNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}

/** The WhatsApp text sent with the PDF, in the owner's usual Hinglish. */
export function whatsappMessage(
  q: Pick<QuoteSnapshot, "customerSnapshot" | "quantity" | "ratePaise" | "gstPercent" | "terms" | "specsSnapshot"> & { totalPaise: number },
  number: string,
  from: string,
): string {
  const s = q.specsSnapshot;
  const unit = isLengthUnit(s.dimUnit) ? s.dimUnit : "mm";
  const size = formatSize(num(s.length), num(s.breadth), num(s.height), unit)?.replace(/ IN$/, " inch").replace(/ MM$/, " mm").replace(/ CM$/, " cm");
  const spec = [`${q.quantity.toLocaleString("en-IN")} boxes`, size, num(s.ply) ? `${s.ply} ply` : null, num(s.loadKg) ? `${s.loadKg} kg load` : null]
    .filter(Boolean)
    .join(", ");
  const terms = [
    q.terms.deliveryTime !== NOT_SET ? `Delivery ${q.terms.deliveryTime}` : null,
    q.terms.paymentTerms !== NOT_SET ? `payment ${q.terms.paymentTerms}` : null,
    q.terms.validity !== NOT_SET ? `rate valid ${q.terms.validity}` : null,
  ].filter(Boolean);
  return [
    `Namaste ${q.customerSnapshot.company} ji, aapki request (${spec}) ka quotation ${number} attached hai.`,
    `Rate ${formatINR(q.ratePaise)} per box + ${q.gstPercent}% GST, total ${formatINR(q.totalPaise)}.`,
    terms.length ? `${terms.join(", ")}.` : null,
    `Dhanyavaad, ${from}`,
  ]
    .filter(Boolean)
    .join(" ");
}
