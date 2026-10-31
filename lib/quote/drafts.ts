import "server-only";
import { randomBytes } from "node:crypto";
import type { HydratedDocument, Types } from "mongoose";
import { buildCardView } from "@/lib/board";
import { requestRef, type CardState } from "@/lib/card";
import { formatINR } from "@/lib/calc/money";
import { stateCodeOf } from "@/lib/company";
import { getCompany } from "@/lib/settings";
import { PendingPlan, Quotation, type QuotationDoc, type RequestDoc } from "@/lib/models";
import { buildQuote, quoteGaps, type BuiltQuote, type QuoteGaps } from "@/lib/quote/build";

/**
 * The working quotation of a card: a draft until approved, still editable once
 * approved, frozen once sent. It is rebuilt from the card whenever the card
 * changes, keeping its number, status and any wording typed over on it.
 * A change after it was sent starts a new revision (…-R1), so what the
 * customer received never changes.
 */

const PLAN_TTL_MS = 24 * 60 * 60 * 1000;

type QuoteDoc = HydratedDocument<QuotationDoc>;

/** The newest quotation of a card, whatever its status (what the card screen shows). */
export async function latestQuotation(requestId: Types.ObjectId | string) {
  return Quotation.findOne({ requestId }).sort({ createdAt: -1 });
}

/** The quotation still being worked on (draft or approved, not yet sent). */
export async function workingQuotation(requestId: Types.ObjectId | string): Promise<QuoteDoc | null> {
  return Quotation.findOne({ requestId, status: { $in: ["Draft", "Approved"] } }).sort({ createdAt: -1 });
}

/** Copies a freshly built quotation into the document (status, number and typed-over wording stay). */
export function fillQuotation(q: QuoteDoc, built: BuiltQuote): void {
  q.customerSnapshot = built.customerSnapshot;
  q.lines = built.lines;
  q.subtotalPaise = built.totals.subtotalPaise;
  q.gstPercent = built.gstPercent;
  q.gstMode = built.gstMode;
  q.cgstPaise = built.totals.cgstPaise;
  q.sgstPaise = built.totals.sgstPaise;
  q.igstPaise = built.totals.igstPaise;
  q.roundOffPaise = built.totals.roundOffPaise;
  q.totalPaise = built.totals.totalPaise;
  q.terms = built.terms;
  q.markModified("lines");
}

export interface SyncResult {
  quote: QuoteDoc | null;
  gaps: QuoteGaps;
}

async function supersedeApproval(requestId: Types.ObjectId): Promise<void> {
  await PendingPlan.updateMany({ action: "approve_quote", requestId, status: "pending" }, { status: "superseded" });
}

/**
 * Brings the working quotation in line with the card. Creates a draft when the
 * card first has everything a quotation needs; removes a draft that can no
 * longer be built; starts a revision when the last one was already sent.
 * Puts up the "approve" plan for a complete draft.
 */
export async function syncQuotation(request: HydratedDocument<RequestDoc>, state: CardState): Promise<SyncResult> {
  const gaps = quoteGaps(state);
  let quote = await workingQuotation(request._id);

  if (gaps.forDraft.length > 0) {
    if (quote && quote.status === "Draft") {
      await quote.deleteOne();
      await supersedeApproval(request._id);
      quote = null;
    }
    return { quote, gaps };
  }

  if (!quote) {
    const lastSent = await Quotation.findOne({ requestId: request._id, status: "Sent" }).sort({ createdAt: -1 });
    quote = new Quotation({
      requestId: request._id,
      customerId: request.customerId,
      status: "Draft",
      shareToken: randomBytes(18).toString("base64url"),
      revision: lastSent ? lastSent.revision + 1 : 0,
      revises: lastSent?._id,
      lineText: lastSent?.lineText ?? {},
      notes: lastSent?.notes ?? "",
    });
  }
  fillQuotation(quote, buildQuote(state, stateCodeOf(await getCompany()), quote.lineText ?? {}));
  await quote.save();

  if (quote.status === "Draft" && gaps.forApproval.length === 0) await offerApproval(request, quote);
  else await supersedeApproval(request._id);
  return { quote, gaps };
}

/** Puts up the "approve this quotation" plan, so the owner's "approve" numbers this draft. */
export async function offerApproval(request: HydratedDocument<RequestDoc>, draft: QuoteDoc): Promise<void> {
  await supersedeApproval(request._id);
  const boxes = draft.lines.length;
  const lines = [
    `Quotation for ${draft.customerSnapshot.company}${boxes > 1 ? `, ${boxes} boxes` : ""}`,
    ...draft.lines.map((l) => `${l.title}: ${l.quantity.toLocaleString("en-IN")} × ${formatINR(l.ratePaise)} = ${formatINR(l.amountPaise)}`),
    `Total with ${draft.gstPercent}% GST: ${formatINR(draft.totalPaise)}`,
    draft.number ? `Keeps its number ${draft.number}. Nothing is sent yet.` : "It gets its number when you approve. Nothing is sent yet.",
  ];
  const card = buildCardView({
    id: "preview",
    number: request.number,
    customerName: request.customerName,
    stage: request.stage,
    boxes: request.items,
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

/** One sentence of what is still needed, for messages. */
export function describeGaps(gaps: QuoteGaps): string {
  return [...gaps.forDraft, ...gaps.forApproval].join("; ");
}
