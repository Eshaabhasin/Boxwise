import { z } from "zod";
import { boxLabel, type Box, type CardState } from "@/lib/card";
import { rupeesToPaise } from "@/lib/calc/money";
import { CHARGES, lineOwner } from "@/lib/quote/build";
import type { FieldKey, Specs } from "@/lib/fields";

/**
 * Edits typed on the quotation. What belongs to the card (quantity, rate,
 * terms, customer details, which boxes there are) goes back to the card, so
 * the card, the quotation and undo stay in step. Wording (line title/detail,
 * notes) belongs to the quotation only. Pure: the API route does the saving.
 */

const Line = z.object({
  /** The card's box id; "new" for a line added on the quotation. */
  itemId: z.string().min(1).max(40),
  title: z.string().trim().max(200),
  detail: z.string().trim().max(500),
  quantity: z.number().int().positive().max(10_000_000),
  /** Rupees as typed (18.5), turned into paise by code. */
  rate: z.number().nonnegative().max(1_000_000),
});

export const QuotationEdit = z.object({
  customer: z.object({
    company: z.string().trim().min(1).max(200),
    contactPerson: z.string().trim().max(200),
    phone: z.string().trim().max(20),
    gstin: z.string().trim().toUpperCase().max(15),
    address: z.string().trim().max(500),
  }),
  lines: z.array(Line).min(1, "A quotation needs at least one line").max(50),
  terms: z.object({
    gstPercent: z.number().min(0).max(28),
    deliveryTime: z.string().trim().max(200),
    paymentTerms: z.string().trim().max(200),
    validity: z.string().trim().max(200),
  }),
  notes: z.string().trim().max(2000),
});
export type QuotationEdit = z.infer<typeof QuotationEdit>;

function textOrNull(v: string): string | null {
  return v && v !== "—" ? v : null;
}

export interface AppliedEdit {
  after: CardState;
  /** Wording to keep on the quotation, by box id. */
  lineText: Record<string, { title?: string; detail?: string }>;
  notes: string;
  /** Company typed differently: the customer is renamed. */
  rename: string | null;
}

/**
 * The card after the typed edits. Lines are matched to boxes by id; a removed
 * line removes its box, a new line adds a box. defaultText is what the
 * quotation would say for a box anyway, so only real rewording is stored.
 */
export function applyQuotationEdit(
  card: CardState,
  edit: QuotationEdit,
  defaultText: (specs: Specs) => { title: string; detail: string },
  newId: () => string,
): AppliedEdit {
  const lineText: AppliedEdit["lineText"] = {};
  const chargeLines = edit.lines.filter((l) => lineOwner(l.itemId).charge !== null);
  const boxes: Box[] = edit.lines.filter((l) => lineOwner(l.itemId).charge === null).map((l) => {
    const existing = card.boxes.find((b) => b.id === l.itemId);
    const box: Box = existing ? { id: existing.id, specs: { ...existing.specs } } : { id: newId(), specs: {} };
    box.specs.quantity = l.quantity;
    box.specs.ratePerBox = rupeesToPaise(l.rate);
    const plain = defaultText(box.specs);
    const own: { title?: string; detail?: string } = {};
    if (l.title && l.title !== plain.title) own.title = l.title;
    if (l.detail !== plain.detail) own.detail = l.detail;
    if (own.title !== undefined || own.detail !== undefined) lineText[box.id] = own;
    // Its one-time charges: the amount typed, or gone when the line was removed.
    for (const c of CHARGES) {
      const line = chargeLines.find((x) => x.itemId === l.itemId + c.suffix);
      const amount = line ? rupeesToPaise(line.rate) : 0;
      if (amount > 0) box.specs[c.key] = amount;
      else delete box.specs[c.key];
      if (line && line.title && line.title !== c.title) lineText[l.itemId + c.suffix] = { title: line.title };
    }
    return box;
  });

  const customer: Specs = { ...card.customer };
  for (const k of ["contactPerson", "phone", "gstin", "address"] as const) {
    const v = textOrNull(edit.customer[k]);
    if (v === null) delete customer[k];
    else customer[k] = v;
  }
  const terms: Specs = { ...card.terms, gstPercent: edit.terms.gstPercent };
  for (const k of ["deliveryTime", "paymentTerms", "validity"] as const satisfies readonly FieldKey[]) {
    const v = textOrNull(edit.terms[k]);
    if (v === null) delete terms[k];
    else terms[k] = v;
  }
  const rename = edit.customer.company !== card.customer.company ? edit.customer.company : null;
  if (rename) customer.company = rename;
  return { after: { ...card, customer, terms, boxes }, lineText, notes: edit.notes, rename };
}

/** One line for the card's history: "Box 2 rate per box: ₹22.00 → ₹21.00; Notes". */
export function describeTypedEdit(lines: readonly string[], wordingChanged: boolean): string {
  const parts = [...lines];
  if (wordingChanged) parts.push("wording on the quotation");
  return `Edited on the quotation: ${parts.join("; ") || "no changes"}`;
}

export { boxLabel };
