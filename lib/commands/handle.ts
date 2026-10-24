import "server-only";
import type { HydratedDocument, Types } from "mongoose";
import { applyPlan } from "@/lib/commands/apply";
import { entryAction } from "@/lib/commands/history";
import { describeScreen, findCustomer, loadCard, resolveTarget, type LoadedCard } from "@/lib/commands/cards";
import { fastCommand } from "@/lib/commands/fastpath";
import { copyableSpecs } from "@/lib/commands/repeat";
import {
  PlanOps,
  buildCreatePlan,
  buildEditPlan,
  buildRatePlan,
  buildStagePlan,
  buildUndoPlan,
  companyKey,
  type ExistingCustomer,
  type PlanView,
} from "@/lib/commands/plan";
import { BoxCardViewSchema, type CommandResult } from "@/lib/commands/types";
import { isLengthUnit } from "@/lib/calc/units";
import { connectDb } from "@/lib/db";
import { Customer, ParseLog, PendingPlan, Quotation, Request, type PendingPlanDoc } from "@/lib/models";
import { QUOTE_FIELDS, missingFor } from "@/lib/quote/build";
import { offerApproval } from "@/lib/quote/drafts";
import { guardRequestFields } from "@/lib/nlp/guard";
import { LlmConfigError, createLlm, llmEnvFromProcess } from "@/lib/nlp/llm";
import { parseCommand, type ParseResult } from "@/lib/nlp/parse";

/**
 * Runs one dictated command. Nothing is ever changed here except by "approve"
 * applying a plan the owner has already seen (golden rule 4). Search and open
 * only read, so they run at once.
 */

const PLAN_TTL_MS = 24 * 60 * 60 * 1000;
type Plan = HydratedDocument<PendingPlanDoc>;

async function latestPendingPlan(): Promise<Plan | null> {
  return PendingPlan.findOne({ status: "pending", expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
}

function planResult(plan: Pick<PendingPlanDoc, "_id" | "lines" | "ops">): CommandResult {
  const view = (plan.ops as { view?: { title?: string; warnings?: string[]; card?: unknown } } | null)?.view;
  const card = BoxCardViewSchema.safeParse(view?.card);
  return {
    kind: "plan",
    planId: plan._id.toString(),
    title: view?.title ?? "Waiting for approval",
    lines: plan.lines,
    warnings: view?.warnings ?? [],
    card: card.success ? card.data : undefined,
  };
}

/** The waiting plan, as the command box shows it (used when a screen loads). */
export async function getPendingPlanResult(): Promise<CommandResult | null> {
  await connectDb();
  const plan = await latestPendingPlan();
  return plan ? planResult(plan) : null;
}

async function savePlan(
  action: string,
  view: PlanView,
  ops: PlanOps,
  sourceText: string,
  opts: { parseLogId?: Types.ObjectId; requestId?: Types.ObjectId; replaces?: Plan | null },
): Promise<CommandResult> {
  if (opts.replaces) {
    opts.replaces.status = "superseded";
    await opts.replaces.save();
    if (opts.replaces.parseLogId) {
      await ParseLog.updateOne({ _id: opts.replaces.parseLogId }, { outcome: "corrected", $push: { corrections: sourceText } });
    }
  }
  const plan = await PendingPlan.create({
    action,
    requestId: opts.requestId,
    lines: view.lines,
    ops: { ...ops, view: { title: view.title, warnings: view.warnings, card: view.card } },
    sourceText,
    parseLogId: opts.parseLogId,
    status: "pending",
    expiresAt: new Date(Date.now() + PLAN_TTL_MS),
  });
  if (opts.parseLogId) await ParseLog.updateOne({ _id: opts.parseLogId }, { planLines: view.lines });
  return planResult(plan);
}

function toExisting(doc: { company: string; contactPerson?: string; phone?: string; gstin?: string; address?: string } | null): ExistingCustomer | null {
  if (!doc) return null;
  return { company: doc.company, contactPerson: doc.contactPerson, phone: doc.phone, gstin: doc.gstin, address: doc.address };
}

/** The earlier utterances of the waiting plan, so a correction is read together with them. */
function earlierOf(pending: Plan | null): { heard: string[]; rawTexts: string[]; requestId?: string } | null {
  if (!pending) return null;
  const ops = PlanOps.safeParse(pending.ops);
  if (!ops.success || ops.data.kind === "undo") return null;
  // A waiting "approve quotation" is not something to correct, but later commands still mean that card.
  if (ops.data.kind === "approve_quote") return { heard: [], rawTexts: [], requestId: ops.data.requestId };
  return {
    heard: ops.data.heard,
    rawTexts: ops.data.rawTexts,
    requestId: ops.data.kind === "create_request" ? undefined : ops.data.requestId,
  };
}

async function makeUndoPlan(path: string, text: string): Promise<CommandResult> {
  const { card: onScreen } = await describeScreen(path);
  // On a card: undo that card's last change. Elsewhere: the last change anywhere.
  const candidates = onScreen
    ? [onScreen.request]
    : await Request.find({ deletedAt: null, "history.undone": false }).sort({ updatedAt: -1 }).limit(20);
  let best: { requestId: string; index: number; at: number } | null = null;
  for (const r of candidates) {
    r.history.forEach((h, index) => {
      if (h.undone || entryAction(h, index) === "undo") return;
      const at = new Date(h.at).getTime();
      if (!best || at > best.at) best = { requestId: r._id.toString(), index, at };
    });
  }
  if (!best) return { kind: "message", text: "There is nothing to undo." };
  const { requestId, index } = best as { requestId: string; index: number };
  const card = await loadCard(requestId);
  const entry = card?.request.history[index];
  if (!card || !entry) return { kind: "message", text: "There is nothing to undo." };
  const action = entryAction(entry, index);
  if (action === "undo") return { kind: "message", text: "There is nothing to undo." };
  const view = buildUndoPlan(card.state, {
    action,
    summary: entry.summary,
    changes: entry.changes,
    stageBefore: entry.stageBefore,
    stageAfter: entry.stageAfter,
  });
  return savePlan("undo", view, { kind: "undo", requestId, planId: entry.planId.toString() }, text, {
    requestId: card.request._id,
  });
}

function parseError(parsed: ParseResult): CommandResult {
  return { kind: "error", text: `Couldn't read that: ${parsed.error} Try again.` };
}

export async function handleCommand(text: string, path: string): Promise<CommandResult> {
  await connectDb();
  const pending = await latestPendingPlan();
  const fast = fastCommand(text);

  if (fast === "approve") {
    if (pending) return applyPlan(pending);
    // "approve" on a card whose draft quotation is complete, after an earlier "cancel".
    const { card } = await describeScreen(path);
    const draft = card ? await Quotation.findOne({ requestId: card.request._id, status: "Draft" }) : null;
    if (card && draft && missingFor(card.state.specs, QUOTE_FIELDS).length === 0) {
      await offerApproval(card.request, draft);
      const offered = await latestPendingPlan();
      if (offered) return applyPlan(offered);
    }
    return { kind: "message", text: "Nothing is waiting for approval." };
  }
  if (fast === "cancel") {
    if (!pending) return { kind: "message", text: "Nothing to cancel." };
    pending.status = "cancelled";
    await pending.save();
    if (pending.parseLogId) await ParseLog.updateOne({ _id: pending.parseLogId }, { outcome: "cancelled" });
    return { kind: "message", text: "Dropped. Nothing was saved." };
  }
  if (fast === "send") {
    const { card } = await describeScreen(path);
    if (!card) return { kind: "message", text: "Open the card first, then say “bhej do”." };
    const quote = await Quotation.findOne({ requestId: card.request._id }).sort({ createdAt: -1 });
    if (!quote) return { kind: "message", text: "There is no quotation on this card yet. Say your rate first." };
    if (quote.status === "Draft") return { kind: "message", text: "Approve the quotation first, then say “bhej do”." };
    return { kind: "share", quotationId: quote._id.toString(), text: `Opening WhatsApp for ${quote.number ?? "the quotation"}…` };
  }
  if (fast === "undo") {
    if (pending && pending.action !== "approve_quote") return { kind: "message", text: "A plan is waiting. Say “approve” or “cancel” for it first, then “undo”." };
    return makeUndoPlan(path, text);
  }

  let llm;
  try {
    llm = createLlm(llmEnvFromProcess());
  } catch (err) {
    if (err instanceof LlmConfigError) return { kind: "error", text: err.message };
    throw err;
  }

  const { screen, card: onScreen } = await describeScreen(path);
  const earlier = earlierOf(pending);
  const earlierCard = earlier?.requestId ? await loadCard(earlier.requestId) : null;
  const unitCard = earlierCard ?? onScreen;
  const parsed = await parseCommand(text, llm, {
    screen,
    screenCompany: onScreen?.request.customerName,
    earlier: earlier?.heard.join(" "),
    defaultUnit: isLengthUnit(unitCard?.state.specs.dimUnit) ? unitCard.state.specs.dimUnit : undefined,
  });

  const log = await ParseLog.create({
    text,
    normalized: parsed.normalized,
    screen,
    requestId: onScreen?.request._id,
    provider: llm.provider,
    model: llm.model,
    llmRaw: parsed.llmRaw,
    llmParsed: parsed.command,
    dropped: parsed.request?.dropped.map((d) => `${d.field}=${d.value}: ${d.reason}`) ?? [],
    outcome: parsed.error ? "error" : "pending",
    error: parsed.error ?? undefined,
    latencyMs: parsed.latencyMs,
  });
  if (parsed.error || !parsed.command) return parseError(parsed);
  const cmd = parsed.command;
  const stillWaiting = pending ? " A plan is still waiting for “approve” or “cancel”." : "";
  const heard = [...(earlier?.heard ?? []), parsed.normalized];
  const rawTexts = [...(earlier?.rawTexts ?? []), text];

  switch (cmd.intent) {
    case "search": {
      await ParseLog.updateOne({ _id: log._id }, { outcome: "approved" });
      const params = new URLSearchParams();
      params.set("filter", cmd.filter ?? (cmd.query ? "All" : "Pending"));
      if (cmd.query) params.set("q", cmd.query);
      const what = [cmd.filter ? `${cmd.filter.toLowerCase()} cards` : "cards", cmd.query ? `matching “${cmd.query}”` : ""].join(" ").trim();
      if (path.startsWith("/history")) {
        const q = cmd.query ? `?q=${encodeURIComponent(cmd.query)}` : "";
        return {
          kind: "message",
          text: `Showing quotations${cmd.query ? ` for “${cmd.query}”` : ""}.${stillWaiting}`,
          navigateTo: `/history${q}`,
        };
      }
      return { kind: "message", text: `Showing ${what}.${stillWaiting}`, navigateTo: `/board?${params.toString()}` };
    }

    case "open": {
      const found = await resolveTarget(cmd.target, null);
      if ("error" in found) return { kind: "message", text: found.error + stillWaiting };
      await ParseLog.updateOne({ _id: log._id }, { outcome: "approved", requestId: found.card.request._id });
      return {
        kind: "message",
        text: `${found.note ? `${found.note} ` : ""}Opened ${found.card.state.ref} ${found.card.request.customerName}.${stillWaiting}`,
        navigateTo: `/quote/${found.card.request._id.toString()}`,
      };
    }

    case "repeat_request": {
      if (!cmd.target) return { kind: "message", text: "Same as last time for which company? Say the name." };
      const customer = await findCustomer(cmd.target);
      if (!customer) return { kind: "message", text: `No earlier order found for “${cmd.target}”.` };
      // The last quotation that went out is the best record of "last time"; else the newest card.
      const lastQuote = await Quotation.findOne({ customerId: customer._id, status: { $in: ["Approved", "Sent"] } })
        .sort({ approvedAt: -1 })
        .lean();
      const lastCard = lastQuote ? null : await Request.findOne({ customerId: customer._id, deletedAt: null }).sort({ createdAt: -1 }).lean();
      const source = lastQuote?.specsSnapshot ?? lastCard?.specs;
      if (!source) return { kind: "message", text: `No earlier order found for ${customer.company}.` };

      const copied = copyableSpecs(source);
      const overrides = parsed.request ?? { customer: {}, specs: {}, sizeWithoutUnit: null, dropped: [] };
      const guarded = {
        ...overrides,
        customer: { company: customer.company },
        specs: { ...copied, ...overrides.specs },
      };
      const view = buildCreatePlan(guarded, parsed.unclear, toExisting(customer));
      const fromWhat = lastQuote
        ? `quotation ${lastQuote.number ?? ""} of ${(lastQuote.approvedAt ?? lastQuote.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`
        : `card ${lastCard?.number ? `REQ-${String(lastCard.number).padStart(3, "0")}` : ""}`;
      view.title = `Same as last time for ${customer.company}`;
      view.lines.unshift(`Copied from ${fromWhat.replace(/\s+/g, " ").trim()}`);
      view.warnings.unshift("Rate and terms are not copied. Say them on the new card.");
      const ops: PlanOps = {
        kind: "create_request",
        customer: { company: customer.company },
        specs: guarded.specs as Record<string, string | number | null>,
        heard,
        rawTexts,
      };
      return savePlan("create_request", view, ops, text, { parseLogId: log._id, replaces: pending });
    }

    case "create_request": {
      if (!parsed.request) return { kind: "message", text: "Didn't catch a box request in that." };
      const guarded = parsed.request;
      const company = guarded.customer.company;
      const existing = company ? await Customer.findOne({ companyKey: companyKey(company) }).lean() : null;
      const view = buildCreatePlan(guarded, parsed.unclear, toExisting(existing));
      const ops: PlanOps = {
        kind: "create_request",
        customer: Object.fromEntries(Object.entries(guarded.customer).filter((e): e is [string, string] => typeof e[1] === "string")),
        specs: Object.fromEntries(Object.entries(guarded.specs).filter(([, v]) => v !== undefined)) as Record<string, string | number | null>,
        heard,
        rawTexts,
      };
      return savePlan("create_request", view, ops, text, { parseLogId: log._id, replaces: pending });
    }

    case "edit_request":
    case "set_rate":
    case "set_stage": {
      // A correction keeps working on the same card unless a different one is named.
      const base: LoadedCard | null = cmd.target ? null : (earlierCard ?? onScreen);
      const found = await resolveTarget(cmd.target, base);
      if ("error" in found) return { kind: "message", text: found.error + stillWaiting };
      const card = found.card;
      const notes = found.note ? [found.note] : [];

      if (cmd.intent === "set_stage") {
        if (!cmd.stage) return { kind: "message", text: "Won, lost or new? Say which." };
        const view = buildStagePlan(card.state, cmd.stage);
        view.warnings.unshift(...notes);
        return savePlan("set_stage", view, { kind: "set_stage", requestId: card.request._id.toString(), stage: cmd.stage, heard, rawTexts }, text, {
          parseLogId: log._id,
          requestId: card.request._id,
          replaces: pending,
        });
      }

      // Re-check the fields with this card's own unit (the target may not be the card on screen).
      // Only the owner's own "set rate" command may carry a rate.
      const isRate = cmd.intent === "set_rate";
      const unit = isLengthUnit(card.state.specs.dimUnit) ? card.state.specs.dimUnit : undefined;
      const guarded = guardRequestFields(cmd.fields, parsed.heardText, { defaultUnit: unit, allowRate: isRate });
      const view = isRate ? buildRatePlan(card.state, guarded, parsed.unclear) : buildEditPlan(card.state, guarded, parsed.unclear);
      view.warnings.unshift(...notes);
      if (Object.keys(view.set).length === 0) {
        await ParseLog.updateOne({ _id: log._id }, { outcome: "cancelled" });
        const why = view.warnings.length ? ` ${view.warnings.join(" ")}` : "";
        return { kind: "message", text: `Nothing to change on ${card.state.ref}.${why}` };
      }
      const ops: PlanOps = {
        kind: "edit_request",
        requestId: card.request._id.toString(),
        set: view.set as Record<string, string | number | null>,
        quote: isRate,
        heard,
        rawTexts,
      };
      return savePlan("edit_request", view, ops, text, { parseLogId: log._id, requestId: card.request._id, replaces: pending });
    }

    default:
      await ParseLog.updateOne({ _id: log._id }, { outcome: "cancelled" });
      return {
        kind: "message",
        text: `Didn't understand that as a command. You can dictate a new request, a change (“height 9 inch kar do”), your rate (“rate 18 rupees, GST 18 percent”), a search (“Sharma dhundo”), “REQ 2 kholo”, “order mil gaya”, or “undo”.${stillWaiting}`,
      };
  }
}
