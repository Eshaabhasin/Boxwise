import "server-only";
import { Types, type HydratedDocument } from "mongoose";
import { companyKey, newBoxId, requestRef, type CardState } from "@/lib/card";
import { cardState, loadCard, refreshMissing, snapshotOf, stateFromSnapshot, writeCard, type LoadedCard } from "@/lib/commands/cards";
import { CREATED_SUMMARY, entryAction, removeTexts } from "@/lib/commands/history";
import { PlanOps, applyEdit as applyEditToCard, type ApproveQuoteOps, type CreateRequestOps, type EditRequestOps, type QuoteTextOps, type SetStageOps, type UndoOps } from "@/lib/commands/plan";
import type { CommandResult } from "@/lib/commands/types";
import { CUSTOMER_FIELD_KEYS, type Specs } from "@/lib/fields";
import { Customer, ParseLog, Quotation, Request, nextSeq, type HistoryEntry, type PendingPlanDoc } from "@/lib/models";
import { financialYear, quoteGaps, quoteNumber } from "@/lib/quote/build";
import { describeGaps, offerApproval, syncQuotation, workingQuotation } from "@/lib/quote/drafts";
import { getCompany, saveCompany } from "@/lib/settings";

/**
 * Applying a plan the owner approved. Every change keeps a snapshot of the
 * card before it in the card's history, so "undo" can put it back exactly.
 */

type Plan = HydratedDocument<PendingPlanDoc>;

async function markApplied(plan: Plan, requestId?: HistoryEntry["planId"]): Promise<void> {
  plan.status = "applied";
  if (requestId) plan.requestId = requestId;
  await plan.save();
  if (plan.parseLogId) await ParseLog.updateOne({ _id: plan.parseLogId }, { outcome: "approved", requestId });
}

function specs(values: Record<string, string | number | null>): Specs {
  return values as Specs;
}

async function applyCreate(plan: Plan, ops: CreateRequestOps): Promise<CommandResult> {
  const company = ops.customer.company;
  if (typeof company !== "string" || !company) {
    return { kind: "error", text: "No company name yet. Say the customer's company name, then approve." };
  }
  const key = companyKey(company);
  const customerSet: Record<string, string> = {};
  for (const k of CUSTOMER_FIELD_KEYS) {
    const v = ops.customer[k];
    if (typeof v === "string" && v && k !== "company") customerSet[k] = v;
  }
  const customer = await Customer.findOneAndUpdate(
    { companyKey: key },
    { $set: customerSet, $setOnInsert: { company, companyKey: key } },
    { upsert: true, returnDocument: "after" },
  );
  if (!customer) return { kind: "error", text: "Couldn't save the customer. Try again." };

  const now = new Date();
  const number = await nextSeq("request");
  const request = new Request({
    number,
    customerId: customer._id,
    customerName: customer.company,
    customerKey: key,
    stage: "New",
    terms: specs(ops.terms),
    rawTexts: ops.rawTexts.map((t) => ({ text: t, at: now })),
    history: [{ planId: plan._id, action: "create", summary: CREATED_SUMMARY, stageAfter: "New", undone: false, at: now }],
  });
  const state: CardState = { ...cardState(request, customer), boxes: ops.boxes.map((b) => ({ id: newBoxId(), specs: specs(b) })) };
  writeCard(request, null, state);
  await request.save();
  await markApplied(plan, request._id);
  // Rates from the formula: the draft quotation is ready at once.
  let next = "";
  if (quoteGaps(state).forDraft.length === 0) {
    const sync = await syncQuotation(request, state);
    if (sync.quote) next = sync.gaps.forApproval.length > 0 ? ` Draft quotation ready; before approving it, still say: ${sync.gaps.forApproval.join(", ")}.` : " Draft quotation ready. Read it, then say “approve”.";
  }
  return {
    kind: "message",
    text: `Saved ${requestRef(number)} for ${customer.company}${state.boxes.length > 1 ? ` with ${state.boxes.length} boxes` : ""}.${next}`,
    navigateTo: `/quote/${request._id.toString()}`,
  };
}

/**
 * Saves a changed card: snapshot for undo, the new values, the history line,
 * and the working quotation brought up to date. Used by voice plans and by
 * edits typed on the quotation.
 */
export async function commitCardChange(
  loaded: LoadedCard,
  after: CardState,
  entry: { planId: Types.ObjectId; summary: string; texts?: string[]; makeQuote?: boolean },
): Promise<string> {
  const { request, customer, state } = loaded;
  const now = new Date();
  writeCard(request, customer, after);
  if (entry.texts?.length) request.rawTexts.push(...entry.texts.map((t) => ({ text: t, at: now })));
  request.history.push({
    planId: entry.planId,
    action: "edit",
    summary: entry.summary,
    texts: entry.texts,
    before: snapshotOf(state),
    undone: false,
    at: now,
  });
  if (customer) await customer.save();
  await request.save();

  // The rate, or any change to a card that already has a quotation, (re)builds it.
  const hasWorking = (await workingQuotation(request._id)) !== null;
  if (!entry.makeQuote && !hasWorking) return `Updated ${after.ref} ${request.customerName}.`;
  const sync = await syncQuotation(request, after);
  if (!sync.quote) return `Saved. For the quotation, still say: ${describeGaps(sync.gaps)}.`;
  if (sync.quote.status === "Approved") return `Updated quotation ${sync.quote.number ?? ""} for ${request.customerName}.`.replace("  ", " ");
  if (sync.gaps.forApproval.length > 0) return `Draft quotation ready. Before approving it, still say: ${sync.gaps.forApproval.join(", ")}.`;
  return sync.quote.revision > 0 ? "New revision ready. Read it, then say “approve”." : "Draft quotation ready. Read it, then say “approve”.";
}

async function applyEdit(plan: Plan, ops: EditRequestOps): Promise<CommandResult> {
  const loaded = await loadCard(ops.requestId);
  if (!loaded) return { kind: "error", text: "That card no longer exists." };
  const after = applyEditToCard(
    loaded.state,
    { customer: specs(ops.customer), terms: specs(ops.terms), set: ops.set.map((s) => ({ id: s.id, values: specs(s.values) })), add: ops.add.map(specs), remove: ops.remove },
    newBoxId,
  );
  const text = await commitCardChange(loaded, after, { planId: plan._id, summary: plan.lines.join("; "), texts: ops.rawTexts, makeQuote: ops.quote });
  await markApplied(plan, loaded.request._id);
  return { kind: "message", text };
}

async function applyApproveQuote(plan: Plan, ops: ApproveQuoteOps): Promise<CommandResult> {
  const loaded = await loadCard(ops.requestId);
  if (!loaded) return { kind: "error", text: "That card no longer exists." };
  const { request, state } = loaded;
  const quote = await Quotation.findById(ops.quotationId);
  if (!quote || quote.status !== "Draft" || !quote.requestId.equals(request._id)) {
    return { kind: "error", text: "That draft has changed since. Read the new one, then say “approve”." };
  }
  const now = new Date();
  if (!quote.number) {
    const revised = quote.revises ? await Quotation.findById(quote.revises) : null;
    if (revised?.number) {
      quote.number = `${revised.number.replace(/-R\d+$/, "")}-R${quote.revision}`;
    } else {
      const fy = financialYear(now);
      quote.number = quoteNumber((await getCompany()).quotePrefix, fy, await nextSeq(`quotation:${fy}`));
    }
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
  const loaded = await loadCard(ops.requestId);
  if (!loaded) return { kind: "error", text: "That card no longer exists." };
  const { request, state } = loaded;
  const now = new Date();
  const before = request.stage;
  request.stage = ops.stage;
  request.rawTexts.push(...ops.rawTexts.map((t) => ({ text: t, at: now })));
  request.history.push({
    planId: plan._id,
    action: "stage",
    summary: plan.lines.join("; "),
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
  const loaded = await loadCard(ops.requestId);
  if (!loaded) return { kind: "error", text: "That card no longer exists." };
  const { request, customer, state } = loaded;
  const index = request.history.findIndex((h) => h.planId?.toString() === ops.planId);
  const entry = request.history[index];
  if (!entry || entry.undone) return { kind: "error", text: "That change was already undone." };
  const action = entryAction(entry, index);
  const now = new Date();

  if (action === "create") {
    request.deletedAt = now;
  } else if (action === "stage") {
    request.stage = entry.stageBefore ?? "New";
    // Undoing "sent": the quotation goes back to approved (not sent).
    if (entry.quotationId) {
      await Quotation.updateOne({ _id: entry.quotationId, status: "Sent" }, { status: "Approved", $unset: { sentAt: 1 } });
    }
  } else if (action === "quote") {
    // Back to draft (it keeps its number) and ask for approval again.
    request.stage = entry.stageBefore ?? "New";
    const quote = entry.quotationId ? await Quotation.findById(entry.quotationId) : null;
    if (quote && quote.status !== "Draft") {
      await Quotation.deleteMany({ requestId: request._id, status: "Draft", _id: { $ne: quote._id } });
      quote.status = "Draft";
      quote.approvedAt = undefined;
      await quote.save();
      await offerApproval(request, quote);
    }
  } else if (entry.before) {
    const restored = stateFromSnapshot(entry.before, { ref: state.ref, stage: state.stage });
    writeCard(request, customer, restored);
    if (customer) await customer.save();
    await request.save();
    if (await workingQuotation(request._id)) await syncQuotation(request, restored);
  } else {
    return { kind: "error", text: "That change was made before boxes were added and can't be undone." };
  }
  entry.undone = true;
  if (entry.texts?.length) request.rawTexts = removeTexts(request.rawTexts, entry.texts);
  request.history.push({
    planId: plan._id,
    action: "undo",
    summary: `Undid: ${entry.summary}`,
    stageBefore: entry.stageAfter,
    stageAfter: entry.stageBefore,
    undone: true,
    at: now,
  });
  request.markModified("history");
  refreshMissing(request, cardState(request, customer));
  await request.save();
  await markApplied(plan, request._id);

  if (action === "create") return { kind: "message", text: `Removed ${state.ref} ${request.customerName}.`, navigateTo: "/board" };
  return { kind: "message", text: `Undone on ${state.ref} ${request.customerName}.` };
}

async function applyQuoteText(plan: Plan, ops: QuoteTextOps): Promise<CommandResult> {
  const done: string[] = [];
  if (ops.seller && Object.keys(ops.seller).length > 0) {
    const saved = await saveCompany(ops.seller);
    if (!saved.ok) return { kind: "error", text: saved.error };
    done.push("Your company details are saved.");
  }
  let requestId: HistoryEntry["planId"] | undefined;
  if (ops.notes !== undefined && ops.requestId) {
    const loaded = await loadCard(ops.requestId);
    if (!loaded) return { kind: "error", text: "That card no longer exists." };
    requestId = loaded.request._id;
    // Notes live on the quotation: the working one, or a new revision if the last was sent.
    const working = (await workingQuotation(loaded.request._id)) ?? (await syncQuotation(loaded.request, loaded.state)).quote;
    if (!working) return { kind: "error", text: "There is no quotation on this card yet. Say your rates first." };
    working.notes = ops.notes;
    await working.save();
    done.push(working.revision > 0 && working.status === "Draft" && !working.number ? "Notes saved on a new revision. Approve it before sending." : "Notes saved.");
  }
  await markApplied(plan, requestId);
  return { kind: "message", text: done.join(" ") || "Nothing to change." };
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
    case "quote_text":
      return applyQuoteText(plan, ops);
  }
}
