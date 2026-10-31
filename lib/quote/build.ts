import { boxLabel, sizeText, type CardState } from "@/lib/card";
import { computeTotalsForLines, formatINR, gstModeFor, lineAmount, type GstMode, type Totals } from "@/lib/calc/money";
import { getField, type FieldKey, type Specs } from "@/lib/fields";

/**
 * Everything on a quotation, computed by code from the card: one line per box
 * (quantity × the owner's rate), GST once on the subtotal, and the terms.
 * No LLM here.
 */

const NOT_SET = "—";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function text(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export interface QuoteGaps {
  /** What stops a draft (each box needs quantity and rate; GST % once). */
  forDraft: string[];
  /** Terms still unsaid; approval waits for them. */
  forApproval: string[];
}

const TERM_KEYS: readonly FieldKey[] = ["deliveryTime", "paymentTerms", "validity"];

export function quoteGaps(card: Pick<CardState, "boxes" | "terms">): QuoteGaps {
  const forDraft: string[] = [];
  if (card.boxes.length === 0) forDraft.push("at least one box");
  card.boxes.forEach((b, i) => {
    const need = [num(b.specs.quantity) === null ? "quantity" : null, num(b.specs.ratePerBox) === null ? "rate" : null].filter(Boolean);
    if (need.length) forDraft.push(`${card.boxes.length > 1 ? `${boxLabel(i)} ` : ""}${need.join(" and ")}`);
  });
  if (num(card.terms.gstPercent) === null) forDraft.push("GST %");
  const forApproval = TERM_KEYS.filter((k) => !text(card.terms[k])).map((k) => getField(k)?.label ?? k);
  return { forDraft, forApproval };
}

/** "Carton box, 5 ply, white", "Self-lock box, 3 ply", "Inner carton, SBS" */
export function itemTitle(specs: Specs): string {
  const ply = num(specs.ply);
  if (specs.boxType === "Inner carton") return `Inner carton, ${specs.board === "SBS" ? "SBS" : "duplex"} 350 GSM`;
  const kind = specs.boxType === "Self-lock" ? "Self-lock box" : specs.boxType === "Carton" ? "Carton box" : "Corrugated box";
  const style = typeof specs.style === "string" && specs.style !== "RSC" ? ` (${specs.style})` : "";
  const colour = typeof specs.colour === "string" ? `, ${specs.colour.toLowerCase()}` : "";
  return `${kind}${style}${ply ? `, ${ply} ply` : ""}${colour}`;
}

/** The one-time charges a box carries, as quotation lines. Their item id is the box id + "~die" / "~design". */
export const CHARGES = [
  { key: "dieCharge", suffix: "~die", title: "Cutting die (one-time)" },
  { key: "designCharge", suffix: "~design", title: "Print design (one-time)" },
] as const satisfies readonly { key: FieldKey; suffix: string; title: string }[];

/** The box a quotation line belongs to, and which charge it is (null for the box itself). */
export function lineOwner(itemId: string): { boxId: string; charge: (typeof CHARGES)[number] | null } {
  const charge = CHARGES.find((c) => itemId.endsWith(c.suffix)) ?? null;
  return { boxId: charge ? itemId.slice(0, -charge.suffix.length) : itemId, charge };
}

/** "12 × 10 × 8 in (outer) · B flute · 30 kg load · 2-colour print · stitched" */
export function itemDetail(specs: Specs): string {
  const parts: string[] = [];
  const size = sizeText(specs)?.replace(/ inch$/, " in");
  if (size) parts.push(typeof specs.sizeType === "string" ? `${size} (${specs.sizeType.toLowerCase()})` : size);
  if (typeof specs.flute === "string") parts.push(`${specs.flute} flute`);
  if (num(specs.gsm)) parts.push(`${specs.gsm} GSM`);
  if (num(specs.bf)) parts.push(`${specs.bf} BF`);
  if (num(specs.burstingStrength)) parts.push(`BS ${specs.burstingStrength} kg/cm²`);
  if (num(specs.loadKg)) parts.push(`${specs.loadKg} kg load`);
  const colours = num(specs.printColours);
  if (colours !== null && colours > 0) parts.push(`${colours}-colour print`);
  else if (specs.print === "Multi-colour") parts.push("multi-colour print");
  else if (colours === 0 || specs.print === "Plain") parts.push("plain");
  if (typeof specs.joint === "string") parts.push(specs.joint.toLowerCase());
  if (typeof specs.coating === "string" && specs.coating !== "None") parts.push(specs.coating.toLowerCase());
  if (typeof specs.partitions === "string") parts.push(`partitions: ${specs.partitions}`);
  return parts.join(" · ");
}

export interface BuiltLine {
  itemId: string;
  title: string;
  detail: string;
  quantity: number;
  ratePaise: number;
  amountPaise: number;
  specs: Specs;
}

export interface BuiltQuote {
  customerSnapshot: { company: string; contactPerson?: string; phone?: string; gstin?: string; address?: string };
  lines: BuiltLine[];
  gstPercent: number;
  gstMode: GstMode;
  totals: Totals;
  terms: { deliveryTime: string; paymentTerms: string; validity: string };
}

/**
 * The quotation for a card. Every box must have quantity and rate, and GST % must be set
 * (see quoteGaps). lineText keeps wording he typed over on the quotation.
 */
export function buildQuote(
  card: Pick<CardState, "boxes" | "terms" | "customer">,
  companyStateCode: string,
  lineText: Record<string, { title?: string; detail?: string }> = {},
): BuiltQuote {
  const gaps = quoteGaps(card);
  if (gaps.forDraft.length > 0) throw new Error(`For a quotation, still needed: ${gaps.forDraft.join("; ")}`);
  const gstPercent = num(card.terms.gstPercent) ?? 0;
  const gstin = text(card.customer.gstin);
  const gstMode = gstModeFor(gstin, companyStateCode);
  const lines: BuiltLine[] = card.boxes.flatMap((b, i) => {
    const quantity = num(b.specs.quantity) ?? 0;
    const ratePaise = num(b.specs.ratePerBox) ?? 0;
    const own = lineText[b.id] ?? {};
    const boxLine: BuiltLine = {
      itemId: b.id,
      title: own.title ?? itemTitle(b.specs),
      detail: own.detail ?? itemDetail(b.specs),
      quantity,
      ratePaise,
      amountPaise: lineAmount(quantity, ratePaise),
      specs: b.specs,
    };
    const charges = CHARGES.flatMap((c): BuiltLine[] => {
      const amount = num(b.specs[c.key]);
      if (!amount) return [];
      const id = b.id + c.suffix;
      const text = lineText[id] ?? {};
      return [{ itemId: id, title: text.title ?? c.title, detail: text.detail ?? (card.boxes.length > 1 ? `For ${boxLabel(i)}` : ""), quantity: 1, ratePaise: amount, amountPaise: amount, specs: {} }];
    });
    return [boxLine, ...charges];
  });
  return {
    customerSnapshot: {
      company: text(card.customer.company) ?? "",
      contactPerson: text(card.customer.contactPerson),
      phone: text(card.customer.phone),
      gstin,
      address: text(card.customer.address),
    },
    lines,
    gstPercent,
    gstMode,
    totals: computeTotalsForLines({ lines, gstPercent, mode: gstMode, roundToRupee: true }),
    terms: {
      deliveryTime: text(card.terms.deliveryTime) ?? NOT_SET,
      paymentTerms: text(card.terms.paymentTerms) ?? NOT_SET,
      validity: text(card.terms.validity) ?? NOT_SET,
    },
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

/** "BB/2026-27/0001", or "BB/2026-27/0001-R1" for a revision. */
export function quoteNumber(prefix: string, fy: string, seq: number, revision = 0): string {
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}${revision > 0 ? `-R${revision}` : ""}`;
}

export interface MessageInput {
  customerSnapshot: { company: string };
  lines: readonly { itemId?: string; quantity: number; ratePaise: number; specs: Specs }[];
  gstPercent: number;
  totalPaise: number;
  terms: { deliveryTime: string; paymentTerms: string; validity: string };
}

/** The message sent with the PDF, in English. */
export function whatsappMessage(q: MessageInput, number: string, from: string): string {
  // Terms are in his words and may end in a full stop; the sentence adds its own.
  const term = (v: string) => v.trim().replace(/[.\s]+$/, "");
  const terms = [
    q.terms.deliveryTime !== NOT_SET ? `Delivery ${term(q.terms.deliveryTime)}` : null,
    q.terms.paymentTerms !== NOT_SET ? `payment ${term(q.terms.paymentTerms)}` : null,
    q.terms.validity !== NOT_SET ? `rate valid for ${term(q.terms.validity)}` : null,
  ].filter(Boolean);
  let what: string;
  const boxLines = q.lines.filter((l) => !("itemId" in l) || lineOwner(String(l.itemId)).charge === null);
  const oneTime = boxLines.length < q.lines.length ? " including one-time charges" : "";
  if (boxLines.length === 1) {
    const l = boxLines[0] as MessageInput["lines"][number];
    const spec = [`${l.quantity.toLocaleString("en-IN")} boxes`, sizeText(l.specs), num(l.specs.ply) ? `${l.specs.ply} ply` : null, num(l.specs.loadKg) ? `${l.specs.loadKg} kg load` : null]
      .filter(Boolean)
      .join(", ");
    what = `please find attached quotation ${number} for your request (${spec}). Rate ${formatINR(l.ratePaise)} per box + ${q.gstPercent}% GST, total ${formatINR(q.totalPaise)}${oneTime}.`;
  } else {
    what = `please find attached quotation ${number} for your request of ${boxLines.length} boxes. Total ${formatINR(q.totalPaise)} with ${q.gstPercent}% GST${oneTime}. The rate for each box is in the PDF.`;
  }
  return [`Dear ${q.customerSnapshot.company}, ${what}`, terms.length ? `${terms.join(", ")}.` : null, `Thank you, ${from}`].filter(Boolean).join(" ");
}
