import "server-only";
import { randomBytes } from "node:crypto";
import type { HydratedDocument, Types } from "mongoose";
import { mergedSpecs } from "@/lib/commands/cards";
import { COMPANY } from "@/lib/company";
import { getField, type FieldKey } from "@/lib/fields";
import { PendingPlan, Quotation, type CustomerDoc, type QuotationDoc, type RequestDoc } from "@/lib/models";
import { formatINR } from "@/lib/calc/money";
import { buildCardView } from "@/lib/board";
import { DRAFT_FIELDS, QUOTE_FIELDS, buildQuoteSnapshot, missingFor } from "@/lib/quote/build";
import { requestRef } from "@/lib/commands/plan";

/**
 * Draft quotations: rebuilt from the card whenever the rate, terms or spec
 * change, until the owner approves one. Approved quotations are never touched.
 */

const PLAN_TTL_MS = 24 * 60 * 60 * 1000;

export async function latestQuotation(requestId: Types.ObjectId | string) {
  return Quotation.findOne({ requestId }).sort({ createdAt: -1 });
}

export async function hasDraft(requestId: Types.ObjectId | string): Promise<boolean> {
  return (await Quotation.exists({ requestId, status: "Draft" })) !== null;
}

export interface DraftResult {
  draft: HydratedDocument<QuotationDoc> | null;
  /** Fields still missing for a draft (rate, GST, quantity). */
  missingForDraft: FieldKey[];
  /** Fields still missing before approval (terms). */
  missingForApproval: FieldKey[];
}

/**
 * Throws away the old draft (if any) and makes a new one from the card as it is now.
 * Also replaces the waiting "approve quotation" plan, so "approve" always means this draft.
 */
export async function refreshDraft(
  request: HydratedDocument<RequestDoc>,
  customer: CustomerDoc | null,
): Promise<DraftResult> {
  await Quotation.deleteMany({ requestId: request._id, status: "Draft" });
  await PendingPlan.updateMany({ action: "approve_quote", requestId: request._id, status: "pending" }, { status: "superseded" });

  const specs = mergedSpecs(request, customer);
  const missingForDraft = missingFor(specs, DRAFT_FIELDS);
  const missingForApproval = missingFor(specs, QUOTE_FIELDS).filter((k) => !missingForDraft.includes(k));
  if (missingForDraft.length > 0) return { draft: null, missingForDraft, missingForApproval };

  const snap = buildQuoteSnapshot(specs, COMPANY.stateCode);
  // The number is given on approval; an earlier approved-then-undone quotation keeps its number.
  const draft = await Quotation.create({
    requestId: request._id,
    customerId: request.customerId,
    customerSnapshot: snap.customerSnapshot,
    specsSnapshot: snap.specsSnapshot,
    quantity: snap.quantity,
    ratePaise: snap.ratePaise,
    subtotalPaise: snap.totals.subtotalPaise,
    gstPercent: snap.gstPercent,
    gstMode: snap.gstMode,
    cgstPaise: snap.totals.cgstPaise,
    sgstPaise: snap.totals.sgstPaise,
    igstPaise: snap.totals.igstPaise,
    roundOffPaise: snap.totals.roundOffPaise,
    totalPaise: snap.totals.totalPaise,
    terms: snap.terms,
    itemTitle: snap.itemTitle,
    itemDetail: snap.itemDetail,
    status: "Draft",
    shareToken: randomBytes(18).toString("base64url"),
  });

  if (missingForApproval.length === 0) await offerApproval(request, draft);
  return { draft, missingForDraft, missingForApproval };
}

/** Puts up the "approve this quotation" plan, so the owner's "approve" numbers this draft. */
export async function offerApproval(request: HydratedDocument<RequestDoc>, draft: HydratedDocument<QuotationDoc>): Promise<void> {
  await PendingPlan.updateMany({ action: "approve_quote", requestId: request._id, status: "pending" }, { status: "superseded" });
  const lines = [
    `Quotation for ${draft.customerSnapshot.company}`,
    `${draft.quantity.toLocaleString("en-IN")} × ${formatINR(draft.ratePaise)} + ${draft.gstPercent}% GST = ${formatINR(draft.totalPaise)}`,
    draft.number ? `Keeps its number ${draft.number}. Nothing is sent yet.` : "It gets its number when you approve. Nothing is sent yet.",
  ];
  const card = buildCardView({
    id: "preview",
    number: request.number,
    customerName: request.customerName,
    stage: request.stage,
    specs: request.specs,
    missing: request.missing,
    hasDraftQuote: true,
  });
  await PendingPlan.create({
    action: "approve_quote",
    requestId: request._id,
    quotationId: draft._id,
    lines,
    ops: {
      kind: "approve_quote",
      requestId: request._id.toString(),
      quotationId: draft._id.toString(),
      view: { title: `Approve the quotation for ${requestRef(request.number)}`, warnings: [], card },
    },
    sourceText: "(draft quotation)",
    status: "pending",
    expiresAt: new Date(Date.now() + PLAN_TTL_MS),
  });
}

export function describeMissing(keys: readonly FieldKey[]): string {
  return keys.map((k) => getField(k)?.label ?? k).join(", ");
}
