import "server-only";
import type { HydratedDocument } from "mongoose";
import { cardMissing, loadCard, mergedSpecs } from "@/lib/commands/cards";
import {
  PlanOps,
  companyKey,
  requestRef,
  type CreateRequestOps,
  type EditRequestOps,
  type ApproveQuoteOps,
  type SetStageOps,
  type UndoOps,
} from "@/lib/commands/plan";
import { CREATED_SUMMARY, entryAction, removeTexts } from "@/lib/commands/history";
import type { CommandResult } from "@/lib/commands/types";
import { COMPANY } from "@/lib/company";
import { CUSTOMER_FIELD_KEYS, type FieldKey, type SpecValue, type Specs } from "@/lib/fields";
import { financialYear, quoteNumber } from "@/lib/quote/build";
import { describeMissing, hasDraft, offerApproval, refreshDraft } from "@/lib/quote/drafts";
import { Customer, ParseLog, Quotation, Request, nextSeq, type CustomerDoc, type FieldChange, type HistoryEntry, type PendingPlanDoc } from "@/lib/models";

/**
 * Applying a plan the owner approved. Every change is written to the card's
 * history with before/after values, so "undo" can reverse it.
 */

type Plan = HydratedDocument<PendingPlanDoc>;

const CUSTOMER_KEYS = new Set<string>(CUSTOMER_FIELD_KEYS);

function summaryOf(plan: Plan): string {
  return plan.lines.join("; ");
}

async function markApplied(plan: Plan, requestId?: HistoryEntry["planId"]): Promise<void> {
  plan.status = "applied";
  if (requestId) plan.requestId = requestId;
  await plan.save();
  if (plan.parseLogId) await ParseLog.updateOne({ _id: plan.parseLogId }, { outcome: "approved", requestId });
}

async function applyCreate(plan: Plan, ops: CreateRequestOps): Promise<CommandResult> {
  const company = ops.customer.company;
  if (!company) {
    return { kind: "error", text: "No company name yet. Say the customer's company name, then approve." };
  }
  const key = companyKey(company);
  const customerSet: Record<string, string> = {};
  for (const k of CUSTOMER_FIELD_KEYS) {
    const v = ops.customer[k];
    if (v && k !== "company") customerSet[k] = v;
  }
  const customer = await Customer.findOneAndUpdate(
    { companyKey: key },
    { $set: customerSet, $setOnInsert: { company, companyKey: key } },
    { upsert: true, returnDocument: "after" },
  );
  if (!customer) return { kind: "error", text: "Couldn't save the customer. Try again." };

  const specs: Specs = {};
  for (const [k, v] of Object.entries(ops.specs)) specs[k as FieldKey] = v;
  const now = new Date();
  const number = await nextSeq("request");
  const request = await Request.create({
    number,
    customerId: customer._id,
    customerName: customer.company,
    customerKey: key,
    stage: "New",
    specs,
    missing: cardMissing(mergedSpecs({ specs, customerName: customer.company }, customer)),
    rawTexts: ops.rawTexts.map((t) => ({ text: t, at: now })),
    history: [
      {
        planId: plan._id,
        action: "create",
        summary: CREATED_SUMMARY,
        changes: Object.entries(specs).map(([field, after]) => ({ field: field as FieldKey, before: null, after: after ?? null })),
        stageAfter: "New",
        undone: false,
        at: now,
      },
    ],
  });
  await markApplied(plan, request._id);
  return {
    kind: "message",
    text: `Saved ${requestRef(number)} for ${customer.company}.`,
    navigateTo: `/quote/${request._id.toString()}`,
  };
}

/** Writes values to the card (specs) or its customer (customer fields), returning what changed. */
function writeValues(
  request: HydratedDocument<import("@/lib/models").RequestDoc>,
  customer: HydratedDocument<CustomerDoc> | null,
  values: Partial<Record<FieldKey, SpecValue>>,
  current: Specs,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const specs: Specs = { ...request.specs };
  for (const [k, v] of Object.entries(values) as [FieldKey, SpecValue][]) {
    changes.push({ field: k, before: current[k] ?? null, after: v });
    if (CUSTOMER_KEYS.has(k)) {
      if (customer && k !== "company") customer.set(k, v === null ? undefined : String(v));
    } else if (v === null) {
      delete specs[k];
    } else {
      specs[k] = v;
    }
  }
  request.specs = specs;
  request.markModified("specs");
  return changes;
}

async function applyEdit(plan: Plan, ops: EditRequestOps): Promise<CommandResult> {
  const card = await loadCard(ops.requestId);
  if (!card) return { kind: "error", text: "That card no longer exists." };
  const { request, customer, state } = card;
  const changes = writeValues(request, customer, ops.set as Partial<Record<FieldKey, SpecValue>>, state.specs);
  const now = new Date();
  request.missing = cardMissing(mergedSpecs(request, customer));
  request.rawTexts.push(...ops.rawTexts.map((t) => ({ text: t, at: now })));
  request.history.push({ planId: plan._id, action: "edit", summary: summaryOf(plan), changes, texts: ops.rawTexts, undone: false, at: now });
  if (customer) await customer.save();
  await request.save();
  await markApplied(plan, request._id);

  // The rate, or any change to a card that already has a draft, rebuilds the draft quotation.
  if (!ops.quote && !(await hasDraft(request._id))) {
    return { kind: "message", text: `Updated ${state.ref} ${request.customerName}.` };
  }
  const draft = await refreshDraft(request, customer);
  if (!draft.draft) {
    return { kind: "message", text: `Saved. For the quotation, still say: ${describeMissing(draft.missingForDraft)}.` };
  }
  if (draft.missingForApproval.length > 0) {
    return { kind: "message", text: `Draft quotation ready. Before approving it, still say: ${describeMissing(draft.missingForApproval)}.` };
  }
  return { kind: "message", text: "Draft quotation ready. Read it, then say “approve”." };
}

async function applyApproveQuote(plan: Plan, ops: ApproveQuoteOps): Promise<CommandResult> {
  const card = await loadCard(ops.requestId);
  if (!card) return { kind: "error", text: "That card no longer exists." };
  const { request, state } = card;
  const quote = await Quotation.findById(ops.quotationId);
  if (!quote || quote.status !== "Draft" || !quote.requestId.equals(request._id)) {
    return { kind: "error", text: "That draft has changed since. Read the new one, then say “approve”." };
  }
  const now = new Date();
  if (!quote.number) {
    const fy = financialYear(now);
    quote.number = quoteNumber(COMPANY.quotePrefix, fy, await nextSeq(`quotation:${fy}`));
  }
  quote.status = "Approved";
  quote.approvedAt = now;
  await quote.save();

  const before = request.stage;
  request.stage = "Quoted";
  request.history.push({
    planId: plan._id,
    action: "quote",
    quotationId: quote._id,
    summary: `Approved ${quote.number}`,
    changes: [],
    stageBefore: before,
    stageAfter: "Quoted",
    undone: false,
    at: now,
  });
  await request.save();
  await markApplied(plan, request._id);
  return { kind: "message", text: `Quotation ${quote.number} for ${state.ref} ${request.customerName} is approved and ready to send.` };
}

async function applyStage(plan: Plan, ops: SetStageOps): Promise<CommandResult> {
  const card = await loadCard(ops.requestId);
  if (!card) return { kind: "error", text: "That card no longer exists." };
  const { request, state } = card;
  const now = new Date();
  const before = request.stage;
  request.stage = ops.stage;
  request.rawTexts.push(...ops.rawTexts.map((t) => ({ text: t, at: now })));
  request.history.push({
    planId: plan._id,
    action: "stage",
    summary: summaryOf(plan),
    changes: [],
    stageBefore: before,
    stageAfter: ops.stage,
    texts: ops.rawTexts,
    undone: false,
    at: now,
  });
  await request.save();
  await markApplied(plan, request._id);
  return { kind: "message", text: `${state.ref} ${request.customerName} is now ${ops.stage}.` };
}

async function applyUndo(plan: Plan, ops: UndoOps): Promise<CommandResult> {
  const card = await loadCard(ops.requestId);
  if (!card) return { kind: "error", text: "That card no longer exists." };
  const { request, customer, state } = card;
  const index = request.history.findIndex((h) => h.planId?.toString() === ops.planId);
  const entry = request.history[index];
  if (!entry || entry.undone) return { kind: "error", text: "That change was already undone." };
  const action = entryAction(entry, index);
  const now = new Date();

  if (action === "create") {
    request.deletedAt = now;
  } else if (action === "stage") {
    request.stage = entry.stageBefore ?? "New";
  } else if (action === "quote") {
    // Back to draft (it keeps its number) and ask for approval again.
    request.stage = entry.stageBefore ?? "New";
    const quote = entry.quotationId ? await Quotation.findById(entry.quotationId) : null;
    if (quote && quote.status !== "Draft") {
      await Quotation.deleteMany({ requestId: request._id, status: "Draft" });
      quote.status = "Draft";
      quote.approvedAt = undefined;
      await quote.save();
      await offerApproval(request, quote);
    }
  } else {
    const restore: Partial<Record<FieldKey, SpecValue>> = {};
    for (const c of entry.changes) restore[c.field] = c.before ?? null;
    writeValues(request, customer, restore, state.specs);
    request.missing = cardMissing(mergedSpecs(request, customer));
    if (await hasDraft(request._id)) {
      await request.save();
      await refreshDraft(request, customer);
    }
  }
  entry.undone = true;
  if (entry.texts?.length) request.rawTexts = removeTexts(request.rawTexts, entry.texts);
  request.history.push({
    planId: plan._id,
    action: "undo",
    summary: `Undid: ${entry.summary}`,
    changes: entry.changes.map((c) => ({ field: c.field, before: c.after, after: c.before })),
    stageBefore: entry.stageAfter,
    stageAfter: entry.stageBefore,
    undone: true,
    at: now,
  });
  request.markModified("history");
  if (customer) await customer.save();
  await request.save();
  await markApplied(plan, request._id);

  if (action === "create") {
    return { kind: "message", text: `Removed ${state.ref} ${request.customerName}.`, navigateTo: "/board" };
  }
  return { kind: "message", text: `Undone on ${state.ref} ${request.customerName}.` };
}

export async function applyPlan(plan: Plan): Promise<CommandResult> {
  const parsed = PlanOps.safeParse(plan.ops);
  if (!parsed.success) return { kind: "error", text: "That plan can't be applied (it was damaged). Say it again." };
  const ops = parsed.data;
  switch (ops.kind) {
    case "create_request":
      return applyCreate(plan, ops);
    case "edit_request":
      return applyEdit(plan, ops);
    case "set_stage":
      return applyStage(plan, ops);
    case "undo":
      return applyUndo(plan, ops);
    case "approve_quote":
      return applyApproveQuote(plan, ops);
  }
}
