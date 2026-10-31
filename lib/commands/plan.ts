import { z } from "zod";
import { buildCardView, type BoxCardView } from "@/lib/board";
import { boxLabel, boxSummary, cardMissing, display, sizeText, type Box, type CardState } from "@/lib/card";
import type { CardEdit, NewCard } from "@/lib/commands/changes";
import { formatINR } from "@/lib/calc/money";
import { DEFAULT_COMPANY, stateCodeOf } from "@/lib/company";
import { SPOKEN_FIELD_DEFS, STAGES, getField, type FieldKey, type SpecValue, type Specs, type Stage } from "@/lib/fields";
import { buildQuote, lineOwner, quoteGaps } from "@/lib/quote/build";

/**
 * Plans: what will happen when the owner says "approve". The lines he reads
 * come from one diff (card before → card after), so creating, editing,
 * setting rates and undoing all read the same way. Pure: no database.
 */

const SpecsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

export const CreateRequestOps = z.object({
  kind: z.literal("create_request"),
  customer: SpecsSchema,
  terms: SpecsSchema,
  boxes: z.array(SpecsSchema),
  /** Normalized text of every utterance in this plan, oldest first. */
  heard: z.array(z.string()),
  /** What was dictated, word for word, oldest first. */
  rawTexts: z.array(z.string()),
});
export type CreateRequestOps = z.infer<typeof CreateRequestOps>;

export const EditRequestOps = z.object({
  kind: z.literal("edit_request"),
  requestId: z.string(),
  customer: SpecsSchema,
  terms: SpecsSchema,
  set: z.array(z.object({ id: z.string(), values: SpecsSchema })),
  add: z.array(SpecsSchema),
  remove: z.array(z.string()),
  /** The owner's rate/terms: after applying, (re)build the draft quotation. */
  quote: z.boolean().default(false),
  heard: z.array(z.string()),
  rawTexts: z.array(z.string()),
});
export type EditRequestOps = z.infer<typeof EditRequestOps>;

export const SetStageOps = z.object({
  kind: z.literal("set_stage"),
  requestId: z.string(),
  stage: z.enum(STAGES),
  heard: z.array(z.string()),
  rawTexts: z.array(z.string()),
});
export type SetStageOps = z.infer<typeof SetStageOps>;

/** Reverse one applied change, found by the plan that made it. */
export const UndoOps = z.object({ kind: z.literal("undo"), requestId: z.string(), planId: z.string() });
export type UndoOps = z.infer<typeof UndoOps>;

/** Approve a draft quotation: give it its number and move the card to Quoted. */
export const ApproveQuoteOps = z.object({ kind: z.literal("approve_quote"), requestId: z.string(), quotationId: z.string() });
export type ApproveQuoteOps = z.infer<typeof ApproveQuoteOps>;

/** Quotation-only words: the notes, or your company name on the letterhead. */
export const QuoteTextOps = z.object({
  kind: z.literal("quote_text"),
  requestId: z.string().optional(),
  notes: z.string().optional(),
  seller: z.object({ name: z.string(), email: z.string(), gstin: z.string(), phone: z.string(), address: z.string() }).partial().optional(),
});
export type QuoteTextOps = z.infer<typeof QuoteTextOps>;

export const PlanOps = z.discriminatedUnion("kind", [CreateRequestOps, EditRequestOps, SetStageOps, UndoOps, ApproveQuoteOps, QuoteTextOps]);
export type PlanOps = z.infer<typeof PlanOps>;

export interface PlanView {
  title: string;
  lines: string[];
  warnings: string[];
  card?: BoxCardView;
}

export interface ExistingCustomer {
  company: string;
  contactPerson?: string;
  phone?: string;
  gstin?: string;
  address?: string;
}

function label(k: FieldKey): string {
  return getField(k)?.label ?? k;
}

export function previewCard(card: CardState, stage: Stage = card.stage): BoxCardView {
  return buildCardView({
    id: "preview",
    ref: card.ref,
    customerName: String(card.customer.company ?? "Company not said"),
    stage,
    boxes: card.boxes,
    missing: cardMissing(card.customer, card.boxes),
  });
}

function changedValue(k: FieldKey, before: SpecValue | undefined, after: SpecValue | undefined, ctxBefore: Specs, ctxAfter: Specs): string {
  if (after === undefined || after === null) return `${label(k)}: ${display(k, before, ctxBefore)} → not set`;
  if (before === undefined || before === null) return `${label(k)}: ${display(k, after, ctxAfter)}`;
  return `${label(k)}: ${display(k, before, ctxBefore)} → ${display(k, after, ctxAfter)}`;
}

function fieldDiff(before: Specs, after: Specs): { key: FieldKey; line: string }[] {
  const out: { key: FieldKey; line: string }[] = [];
  for (const f of SPOKEN_FIELD_DEFS) {
    const k = f.key as FieldKey;
    if (before[k] === after[k]) continue;
    if ((before[k] ?? null) === (after[k] ?? null)) continue;
    out.push({ key: k, line: changedValue(k, before[k], after[k], before, after) });
  }
  return out;
}

/** Lines describing how card `a` becomes card `b`, in card order. */
export function diffLines(a: CardState, b: CardState): string[] {
  const lines: string[] = [];
  for (const d of fieldDiff(a.customer, b.customer)) lines.push(d.line);
  const many = a.boxes.length > 1 || b.boxes.length > 1;
  b.boxes.forEach((box, i) => {
    const old = a.boxes.find((x) => x.id === box.id);
    if (!old) {
      lines.push(`Add ${boxLabel(i)}: ${boxSummary(box.specs)}`);
      return;
    }
    // Sizes read better as one line than three.
    const diffs = fieldDiff(old.specs, box.specs);
    const sides = diffs.filter((d) => d.key === "length" || d.key === "breadth" || d.key === "height");
    const prefix = many ? `${boxLabel(i)} ` : "";
    if (sides.length > 1) {
      const from = sizeText(old.specs);
      lines.push(from ? `${prefix}${many ? "size" : "Size"}: ${from} → ${sizeText(box.specs) ?? "—"}` : `${prefix}${many ? "size" : "Size"}: ${sizeText(box.specs) ?? "—"}`);
    }
    for (const d of diffs) {
      if (sides.length > 1 && sides.includes(d)) continue;
      if (d.key === "dimUnit" && sides.length > 1) continue;
      lines.push(many ? `${prefix}${d.line.charAt(0).toLowerCase()}${d.line.slice(1)}` : d.line);
    }
  });
  a.boxes.forEach((box, i) => {
    if (!b.boxes.some((x) => x.id === box.id)) lines.push(`Remove ${boxLabel(i)} (${boxSummary(box.specs)})`);
  });
  for (const d of fieldDiff(a.terms, b.terms)) lines.push(d.line);
  if (a.stage !== b.stage) lines.push(`Stage: ${a.stage} → ${b.stage}`);
  return lines;
}

/** The card after an edit (same rules the server uses when it applies the plan). */
export function applyEdit(card: CardState, edit: Pick<CardEdit, "customer" | "terms" | "set" | "add" | "remove">, newId: () => string): CardState {
  const boxes: Box[] = card.boxes
    .filter((b) => !edit.remove.includes(b.id))
    .map((b) => {
      const set = edit.set.find((s) => s.id === b.id);
      if (!set) return b;
      const specs: Specs = { ...b.specs };
      for (const [k, v] of Object.entries(set.values) as [FieldKey, SpecValue][]) {
        if (v === null) delete specs[k];
        else specs[k] = v;
      }
      return { ...b, specs };
    });
  for (const specs of edit.add) boxes.push({ id: newId(), specs: { ...specs } });
  const merge = (base: Specs, values: Specs): Specs => {
    const out = { ...base };
    for (const [k, v] of Object.entries(values) as [FieldKey, SpecValue][]) {
      if (k === "company") continue; // renaming a customer is not done by voice
      if (v === null) delete out[k];
      else out[k] = v;
    }
    return out;
  };
  return { ...card, customer: merge(card.customer, edit.customer), terms: merge(card.terms, edit.terms), boxes };
}

/** The quotation totals a card would give, for the plan (none until it can be built). */
export function totalsLines(card: CardState, stateCode: string): string[] {
  const gaps = quoteGaps(card);
  if (gaps.forDraft.length > 0) return [];
  const q = buildQuote(card, stateCode);
  const boxCount = q.lines.filter((l) => lineOwner(l.itemId).charge === null).length;
  let n = 0;
  const lines = q.lines.map((l) => {
    const owner = lineOwner(l.itemId);
    if (owner.charge) return `${l.title}${l.detail ? ` ${l.detail.toLowerCase()}` : ""}: ${formatINR(l.amountPaise)}`;
    const name = boxCount > 1 ? `${boxLabel(n)}: ` : "";
    n += 1;
    return `${name}${l.quantity.toLocaleString("en-IN")} × ${formatINR(l.ratePaise)} = ${formatINR(l.amountPaise)}`;
  });
  const t = q.totals;
  lines.push(
    q.gstMode === "intra" ? `CGST ${q.gstPercent / 2}% + SGST ${q.gstPercent / 2}%: ${formatINR(t.gstPaise)}` : `IGST ${q.gstPercent}%: ${formatINR(t.gstPaise)}`,
  );
  if (t.roundOffPaise !== 0) lines.push(`Round off: ${formatINR(t.roundOffPaise)}`);
  lines.push(`Total: ${formatINR(t.totalPaise)}`);
  return lines;
}

/** A new enquiry with its boxes. */
export function buildCreatePlan(newCard: NewCard, unclear: readonly string[], existing: ExistingCustomer | null, ref = "New"): PlanView {
  const company = typeof newCard.customer.company === "string" ? newCard.customer.company : existing?.company;
  const customer: Specs = { ...(existing ?? {}), ...newCard.customer, ...(company ? { company } : {}) };
  const card: CardState = {
    ref,
    stage: "New",
    customer,
    terms: newCard.terms,
    boxes: newCard.boxes.map((specs, i) => ({ id: `new${i}`, specs })),
  };
  const lines: string[] = [];
  if (company) lines.push(existing ? `Customer: ${existing.company} (already in your list)` : `Customer: ${company} (new customer)`);
  for (const k of ["contactPerson", "phone", "gstin", "address"] as const) {
    const v = newCard.customer[k];
    if (v === undefined || v === null) continue;
    const before = existing?.[k];
    lines.push(before && before !== v ? `${label(k)}: ${v} (was ${before})` : `${label(k)}: ${v}`);
  }
  card.boxes.forEach((b, i) => lines.push(`${boxLabel(i)}: ${boxSummary(b.specs)}`));
  for (const d of fieldDiff({}, newCard.terms)) lines.push(d.line);

  const missing = cardMissing(customer, card.boxes);
  if (missing.length > 0) {
    const names = [...new Set(missing.map((k) => (["length", "breadth", "height"].includes(k) ? "Size" : label(k))))];
    lines.push(`Not said: ${names.join(", ")}`);
  }
  const warnings = [...newCard.warnings, ...unclear.map((u) => `Unclear: ${u}`)];
  if (!company) warnings.push("No company name heard. Say the customer's company name.");
  const n = card.boxes.length;
  return {
    title: company ? `New enquiry from ${company}${n > 1 ? ` (${n} boxes)` : ""}` : "New enquiry",
    lines,
    warnings,
    card: previewCard(card),
  };
}

/**
 * An edit, add/remove of boxes, or the owner's rate and terms. Returns the
 * card after the change so the server applies exactly what was shown.
 */
export function buildEditPlan(
  card: CardState,
  edit: CardEdit,
  unclear: readonly string[],
  opts: {
    rate?: boolean;
    /** Your GSTIN's state code (CGST+SGST or IGST). */
    stateCode?: string;
    /** How the formula worked out each rate, shown before the totals. */
    formula?: readonly string[];
  } = {},
): PlanView & { after: CardState; empty: boolean } {
  let n = 0;
  const after = applyEdit(card, edit, () => `added${n++}`);
  const lines = diffLines(card, after);
  const warnings = [...edit.warnings, ...unclear.map((u) => `Unclear: ${u}`)];
  if (typeof edit.customer.company === "string" && edit.customer.company !== card.customer.company) {
    warnings.push(`Left out company “${edit.customer.company}”: renaming a customer isn't supported yet.`);
  }
  lines.push(...(opts.formula ?? []));
  if (opts.rate) {
    lines.push(...totalsLines(after, opts.stateCode ?? stateCodeOf(DEFAULT_COMPANY)));
    const gaps = quoteGaps(after);
    if (gaps.forDraft.length > 0) warnings.push(`For the totals, still say: ${gaps.forDraft.join("; ")}.`);
    else if (gaps.forApproval.length > 0) lines.push(`Still needed before approval: ${gaps.forApproval.join(", ")}`);
  }
  const company = String(card.customer.company ?? "");
  return {
    title: `${opts.rate ? "Rates for" : "Change"} ${card.ref} ${company}`.trim(),
    lines,
    warnings,
    card: previewCard(after),
    after,
    empty: diffLines(card, after).length === 0,
  };
}

export function buildStagePlan(card: CardState, stage: Stage): PlanView {
  return {
    title: `Move ${card.ref} ${String(card.customer.company ?? "")}`.trim(),
    lines: [`Stage: ${card.stage} → ${stage}`],
    warnings: card.stage === stage ? [`It is already ${stage}.`] : [],
    card: previewCard(card, stage),
  };
}

export interface UndoEntry {
  action: "create" | "edit" | "stage" | "quote";
  summary: string;
  /** For edits: the card as it was before. */
  before?: CardState;
  stageBefore?: Stage;
  stageAfter?: Stage;
}

/** What undoing one history entry will do. */
export function buildUndoPlan(card: CardState, entry: UndoEntry): PlanView {
  const title = `Undo on ${card.ref} ${String(card.customer.company ?? "")}`.trim();
  if (entry.action === "create") {
    return { title, lines: [`Remove card ${card.ref} ${String(card.customer.company ?? "")} (it was just made)`], warnings: [], card: previewCard(card) };
  }
  if (entry.action === "quote") {
    return {
      title,
      lines: [`Take back approval: ${entry.summary.replace(/^Approved /, "")} goes back to draft`, `Stage: ${entry.stageAfter ?? card.stage} → ${entry.stageBefore ?? "New"}`],
      warnings: [],
      card: previewCard(card, entry.stageBefore ?? "New"),
    };
  }
  if (entry.action === "stage") {
    return { title, lines: [`Stage: ${entry.stageAfter ?? card.stage} → ${entry.stageBefore ?? "New"}`], warnings: [], card: previewCard(card, entry.stageBefore ?? "New") };
  }
  if (!entry.before) return { title, lines: ["This change can't be undone (it was made before boxes were added)."], warnings: [], card: previewCard(card) };
  const before = { ...entry.before, ref: card.ref, stage: card.stage };
  return { title, lines: diffLines(card, before), warnings: [], card: previewCard(before) };
}
