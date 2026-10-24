import { z } from "zod";
import { buildCardView, type BoxCardView } from "@/lib/board";
import { formatSize, isLengthUnit, fromMm } from "@/lib/calc/units";
import { FIELD_DEFS, STAGES, missingFields, getField, type FieldKey, type SpecValue, type Specs, type Stage } from "@/lib/fields";
import { formatINR } from "@/lib/calc/money";
import { COMPANY } from "@/lib/company";
import type { GuardedRequest } from "@/lib/nlp/guard";
import { DRAFT_FIELDS, QUOTE_FIELDS, buildQuoteSnapshot, missingFor } from "@/lib/quote/build";

/** What a "create request" plan will do when approved. Stored on the pending plan and checked again before applying. */
export const CreateRequestOps = z.object({
  kind: z.literal("create_request"),
  customer: z.record(z.string(), z.string()),
  specs: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  /** Normalized text of every utterance in this plan, oldest first. */
  heard: z.array(z.string()),
  /** What was dictated, word for word, oldest first. */
  rawTexts: z.array(z.string()),
});
export type CreateRequestOps = z.infer<typeof CreateRequestOps>;

const SpecValueSchema = z.union([z.string(), z.number(), z.null()]);

/** Change fields of one card (customer fields go to the customer record). */
export const EditRequestOps = z.object({
  kind: z.literal("edit_request"),
  requestId: z.string(),
  set: z.record(z.string(), SpecValueSchema),
  /** The owner's rate/terms: after applying, build the draft quotation. */
  quote: z.boolean().default(false),
  heard: z.array(z.string()),
  rawTexts: z.array(z.string()),
});
export type EditRequestOps = z.infer<typeof EditRequestOps>;

/** Move a card to Won, Lost or back to New. */
export const SetStageOps = z.object({
  kind: z.literal("set_stage"),
  requestId: z.string(),
  stage: z.enum(STAGES),
  heard: z.array(z.string()),
  rawTexts: z.array(z.string()),
});
export type SetStageOps = z.infer<typeof SetStageOps>;

/** Reverse one applied change, found by the plan that made it. */
export const UndoOps = z.object({
  kind: z.literal("undo"),
  requestId: z.string(),
  planId: z.string(),
});
export type UndoOps = z.infer<typeof UndoOps>;

/** Approve a draft quotation: give it its number and move the card to Quoted. */
export const ApproveQuoteOps = z.object({
  kind: z.literal("approve_quote"),
  requestId: z.string(),
  quotationId: z.string(),
});
export type ApproveQuoteOps = z.infer<typeof ApproveQuoteOps>;

export const PlanOps = z.discriminatedUnion("kind", [CreateRequestOps, EditRequestOps, SetStageOps, UndoOps, ApproveQuoteOps]);
export type PlanOps = z.infer<typeof PlanOps>;

/** "Sharma Packaging" -> "sharma packaging"; used to match a customer said twice. */
export function companyKey(company: string): string {
  return (company.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

export interface ExistingCustomer {
  company: string;
  contactPerson?: string;
  phone?: string;
  gstin?: string;
  address?: string;
}

export interface PlanView {
  title: string;
  lines: string[];
  warnings: string[];
  card: BoxCardView;
}

export function display(key: FieldKey, value: SpecValue | undefined, specs: Specs): string {
  if (value === undefined) return "—";
  const f = getField(key);
  if (value === null) return "—";
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

/**
 * The plan he reads before saying "approve": one line per value that will be
 * saved, what was not said, and anything that was heard but dropped.
 */
export function buildCreatePlan(
  guarded: GuardedRequest,
  unclear: readonly string[],
  existing: ExistingCustomer | null,
): PlanView {
  const lines: string[] = [];
  const warnings: string[] = [];
  const { customer, specs } = guarded;
  const company = customer.company ?? existing?.company;

  if (company) {
    lines.push(existing ? `Customer: ${existing.company} (already in your list)` : `Customer: ${company} (new customer)`);
  }
  for (const key of ["contactPerson", "phone", "gstin", "address"] as const) {
    const v = customer[key];
    if (!v) continue;
    const label = getField(key)?.label ?? key;
    const before = existing?.[key];
    lines.push(before && before !== v ? `${label}: ${v} (was ${before})` : `${label}: ${v}`);
  }

  const size = formatSize(
    typeof specs.length === "number" ? specs.length : null,
    typeof specs.breadth === "number" ? specs.breadth : null,
    typeof specs.height === "number" ? specs.height : null,
    isLengthUnit(specs.dimUnit) ? specs.dimUnit : "mm",
  );
  if (size) lines.push(`Size: ${size.replace(/ IN$/, " inch").replace(/ MM$/, " mm").replace(/ CM$/, " cm")}`);

  for (const f of FIELD_DEFS) {
    const key = f.key as FieldKey;
    if (f.onCustomer || f.kind === "length" || key === "dimUnit") continue;
    const v = specs[key];
    if (v === undefined) continue;
    lines.push(`${f.label}: ${display(key, v, specs)}`);
  }

  if (guarded.sizeWithoutUnit) {
    const s = guarded.sizeWithoutUnit;
    warnings.push(
      `Size ${[s.length, s.breadth, s.height].map((n) => n ?? "?").join(" × ")} has no unit. Say “inch”, “cm” or “mm”, or it won't be saved.`,
    );
  }
  for (const d of guarded.dropped) {
    const label = getField(d.field)?.label ?? d.field;
    warnings.push(`Left out ${label} “${d.value}”: ${d.reason}.`);
  }
  for (const note of unclear) warnings.push(`Unclear: ${note}`);
  if (!company) warnings.push("No company name heard. Say the customer's company name.");

  const known: Specs = { ...specs, ...customer, ...(existing ?? {}) };
  const missing = missingFields(known, "card");
  if (missing.length > 0) {
    const labels = [...new Set(missing.map((k) => (["length", "breadth", "height"].includes(k) ? "Size" : getField(k)?.label ?? k)))];
    lines.push(`Not said: ${labels.join(", ")}`);
  }

  return {
    title: company ? `New box card for ${company}` : "New box card",
    lines,
    warnings,
    card: buildCardView({ id: "preview", customerName: company ?? "Company not said", stage: "New", specs, missing }),
  };
}

/** "REQ-016" */
export function requestRef(number: number | undefined): string {
  return number ? `REQ-${String(number).padStart(3, "0")}` : "REQ";
}

/** The card as it stands now, for building edit, stage and undo plans. */
export interface CardState {
  ref: string;
  stage: Stage;
  /** Card specs merged with the customer's fields. */
  specs: Specs;
}

const SIDES: readonly FieldKey[] = ["length", "breadth", "height"];

function viewAfter(card: CardState, specs: Specs, stage: Stage): BoxCardView {
  return buildCardView({
    id: "preview",
    customerName: typeof specs.company === "string" ? specs.company : "",
    stage,
    specs,
    missing: missingFields(specs, "card"),
  });
}

/**
 * An edit plan: "Height: 8 inch → 9 inch". Only values that change are listed;
 * repeating the current value is reported, not planned.
 * Returns null "set" when nothing would change.
 */
export function buildEditPlan(
  card: CardState,
  guarded: GuardedRequest,
  unclear: readonly string[],
): PlanView & { set: Partial<Record<FieldKey, SpecValue>> } {
  const set: Partial<Record<FieldKey, SpecValue>> = {};
  const lines: string[] = [];
  const warnings: string[] = [];
  const incoming: Partial<Record<FieldKey, SpecValue>> = { ...guarded.specs, ...guarded.customer };

  // A unit said with one side ("height 9 inch") only tells how to read that side;
  // it changes the card's unit only if the card had none or all three sides were said.
  const sidesSaid = SIDES.filter((k) => incoming[k] !== undefined).length;
  if (incoming.dimUnit !== undefined && card.specs.dimUnit && sidesSaid < 3) delete incoming.dimUnit;

  if (incoming.company !== undefined && incoming.company !== card.specs.company) {
    warnings.push(`Left out company “${String(incoming.company)}”: renaming a customer isn't supported yet.`);
  }
  delete incoming.company;

  const after: Specs = { ...card.specs };
  for (const [k, v] of Object.entries(incoming) as [FieldKey, SpecValue][]) {
    if (v === undefined) continue;
    if (card.specs[k] === v) {
      warnings.push(`${getField(k)?.label ?? k} is already ${display(k, v, card.specs)}.`);
      continue;
    }
    set[k] = v;
    after[k] = v;
  }
  // Lines follow the order of lib/fields.ts, like the card.
  for (const f of FIELD_DEFS) {
    const k = f.key as FieldKey;
    const v = set[k];
    if (v === undefined) continue;
    const label = f.label;
    const before = card.specs[k];
    lines.push(
      before === undefined || before === null
        ? `${label}: ${display(k, v, after)}`
        : `${label}: ${display(k, before, card.specs)} → ${display(k, v, after)}`,
    );
  }
  if (guarded.sizeWithoutUnit) {
    warnings.push("A size was said without a unit and this card has none yet. Say “inch”, “cm” or “mm”.");
  }
  for (const d of guarded.dropped) {
    warnings.push(`Left out ${getField(d.field)?.label ?? d.field} “${d.value}”: ${d.reason}.`);
  }
  for (const note of unclear) warnings.push(`Unclear: ${note}`);

  return {
    title: `Change ${card.ref} ${String(card.specs.company ?? "")}`.trim(),
    lines,
    warnings,
    card: viewAfter(card, after, card.stage),
    set,
  };
}

export function buildStagePlan(card: CardState, stage: Stage): PlanView {
  return {
    title: `Move ${card.ref} ${String(card.specs.company ?? "")}`.trim(),
    lines: [`Stage: ${card.stage} → ${stage}`],
    warnings: card.stage === stage ? [`It is already ${stage}.`] : [],
    card: viewAfter(card, card.specs, stage),
  };
}

/**
 * The owner's rate and terms: the edit lines, then the totals worked out by
 * code, then what is still needed before the quotation can be approved.
 */
export function buildRatePlan(
  card: CardState,
  guarded: GuardedRequest,
  unclear: readonly string[],
): PlanView & { set: Partial<Record<FieldKey, SpecValue>> } {
  const plan = buildEditPlan(card, guarded, unclear);
  plan.title = `Rate for ${card.ref} ${String(card.specs.company ?? "")}`.trim();
  const after: Specs = { ...card.specs, ...plan.set };
  const needDraft = missingFor(after, DRAFT_FIELDS);
  if (needDraft.length === 0) {
    const q = buildQuoteSnapshot(after, COMPANY.stateCode);
    const t = q.totals;
    plan.lines.push(`Subtotal, ${q.quantity.toLocaleString("en-IN")} × ${formatINR(q.ratePaise)}: ${formatINR(t.subtotalPaise)}`);
    if (q.gstMode === "intra") {
      plan.lines.push(`CGST ${q.gstPercent / 2}% + SGST ${q.gstPercent / 2}%: ${formatINR(t.gstPaise)}`);
    } else {
      plan.lines.push(`IGST ${q.gstPercent}%: ${formatINR(t.gstPaise)}`);
    }
    if (t.roundOffPaise !== 0) plan.lines.push(`Round off: ${formatINR(t.roundOffPaise)}`);
    plan.lines.push(`Total: ${formatINR(t.totalPaise)}`);
  } else {
    plan.warnings.push(`For the totals, still say: ${needDraft.map((k) => getField(k)?.label ?? k).join(", ")}.`);
  }
  const needQuote = missingFor(after, QUOTE_FIELDS).filter((k) => !needDraft.includes(k));
  if (needQuote.length > 0) {
    plan.lines.push(`Still needed before approval: ${needQuote.map((k) => getField(k)?.label ?? k).join(", ")}`);
  }
  return plan;
}

export interface UndoEntry {
  action: "create" | "edit" | "stage" | "quote";
  summary: string;
  changes: { field: FieldKey; before: SpecValue; after: SpecValue }[];
  stageBefore?: Stage;
  stageAfter?: Stage;
}

/** What undoing one history entry will do. */
export function buildUndoPlan(card: CardState, entry: UndoEntry): PlanView {
  const title = `Undo on ${card.ref} ${String(card.specs.company ?? "")}`.trim();
  if (entry.action === "create") {
    return {
      title,
      lines: [`Remove card ${card.ref} ${String(card.specs.company ?? "")} (it was just made)`],
      warnings: [],
      card: viewAfter(card, card.specs, card.stage),
    };
  }
  if (entry.action === "quote") {
    return {
      title,
      lines: [`Take back approval: ${entry.summary.replace(/^Approved /, "")} goes back to draft`, `Stage: ${entry.stageAfter ?? card.stage} → ${entry.stageBefore ?? "New"}`],
      warnings: [],
      card: viewAfter(card, card.specs, entry.stageBefore ?? "New"),
    };
  }
  if (entry.action === "stage") {
    return {
      title,
      lines: [`Stage: ${entry.stageAfter ?? card.stage} → ${entry.stageBefore ?? "New"}`],
      warnings: [],
      card: viewAfter(card, card.specs, entry.stageBefore ?? "New"),
    };
  }
  const after: Specs = { ...card.specs };
  const lines: string[] = [];
  for (const c of entry.changes) {
    after[c.field] = c.before ?? undefined;
    const label = getField(c.field)?.label ?? c.field;
    lines.push(`${label}: ${display(c.field, card.specs[c.field] ?? null, card.specs)} → ${c.before === null ? "not set" : display(c.field, c.before, after)}`);
  }
  return { title, lines, warnings: [], card: viewAfter(card, after, card.stage) };
}
