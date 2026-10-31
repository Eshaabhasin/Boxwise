import "server-only";
import type { HydratedDocument, Types } from "mongoose";
import { AI_LIMIT_MESSAGE, aiCounterName, aiDailyLimit, isProviderDailyLimit } from "@/lib/commands/ai-limit";
import { applyPlan } from "@/lib/commands/apply";
import { entryAction } from "@/lib/commands/history";
import { companyKey, type Box } from "@/lib/card";
import { collectCreate, collectEdit } from "@/lib/commands/changes";
import { describeScreen, findCustomer, loadCard, resolveTarget, stateFromSnapshot, type LoadedCard } from "@/lib/commands/cards";
import { fastCommand } from "@/lib/commands/fastpath";
import { understoodFrom, type Understood } from "@/lib/checklist";
import { copyableSpecs } from "@/lib/commands/repeat";
import { PlanOps, buildCreatePlan, buildEditPlan, buildStagePlan, buildUndoPlan, previewCard, totalsLines, type ExistingCustomer, type PlanView } from "@/lib/commands/plan";
import type { NewCard } from "@/lib/commands/changes";
import type { Specs } from "@/lib/fields";
import { priceEdit, priceNewCard } from "@/lib/pricing/apply";
import { SELLER_KEYS, SELLER_LABEL, readQuoteText, type QuoteText, type SellerWords } from "@/lib/commands/quotetext";
import { BoxCardViewSchema, type CommandResult } from "@/lib/commands/types";
import { CompanyProfile, stateCodeOf } from "@/lib/company";
import { connectDb } from "@/lib/db";
import { getCompany, getPricing, saveCompany } from "@/lib/settings";
import { Customer, ParseLog, PendingPlan, Quotation, Request, nextSeq, type PendingPlanDoc } from "@/lib/models";
import { quoteGaps } from "@/lib/quote/build";
import { offerApproval } from "@/lib/quote/drafts";
import type { GuardedRequest } from "@/lib/nlp/guard";
import { LlmConfigError, createLlm, llmEnvFromProcess } from "@/lib/nlp/llm";
import { parseCommand, type ParseResult } from "@/lib/nlp/parse";

/**
 * Runs one dictated command. Nothing is ever changed here except by "approve"
 * applying a plan the owner has already seen (golden rule 4). Search and open
 * only read, so they run at once.
 */

const PLAN_TTL_MS = 24 * 60 * 60 * 1000;
const NOTHING: GuardedRequest = { customer: {}, specs: {}, sizeWithoutUnit: null, dropped: [] };
const R = (v: object) => v as Record<string, string | number | null>;
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
    understood: understoodOf(plan.ops),
  };
}

/**
 * The plan this command belongs to. New quote starts clean: an old plan he isn't
 * looking at there must not swallow a new request as a "correction". It is dropped
 * (nothing was saved), except a quotation waiting for approval, which simply stays waiting.
 */
async function waitingPlanFor(path: string, planId?: string): Promise<Plan | null> {
  const plan = await latestPendingPlan();
  if (!plan || !path.startsWith("/quote/new") || plan._id.toString() === planId) return plan;
  if (plan.action !== "approve_quote") {
    plan.status = "superseded";
    await plan.save();
    if (plan.parseLogId) await ParseLog.updateOne({ _id: plan.parseLogId }, { outcome: "cancelled" });
  }
  return null;
}

/** A new enquiry's boxes, in checklist terms. */
function understoodOf(ops: unknown): Understood | undefined {
  const parsed = PlanOps.safeParse(ops);
  return parsed.success && parsed.data.kind === "create_request" ? understoodFrom(parsed.data.boxes) : undefined;
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
  if (!ops.success || ops.data.kind === "undo" || ops.data.kind === "quote_text") return null;
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
    before: entry.before ? stateFromSnapshot(entry.before, card.state) : undefined,
    stageBefore: entry.stageBefore,
    stageAfter: entry.stageAfter,
  });
  return savePlan("undo", view, { kind: "undo", requestId, planId: entry.planId.toString() }, text, {
    requestId: card.request._id,
  });
}

/** "notes mein likho …" / "hamari company ka naam … karo": a plan like any other, approved before it is saved. */
/** Each detail is checked on its own: a wrong GSTIN is left out, the rest still goes in. */
async function checkSeller(said: SellerWords): Promise<{ seller: SellerWords; lines: string[]; problems: string[] }> {
  const company = await getCompany();
  const seller: SellerWords = {};
  const lines: string[] = [];
  const problems: string[] = [];
  for (const key of SELLER_KEYS) {
    const value = said[key];
    if (value === undefined) continue;
    const checked = CompanyProfile.shape[key].safeParse(value);
    if (!checked.success) {
      problems.push(`${SELLER_LABEL[key]} “${value}” not changed: ${checked.error.issues[0]?.message ?? "it doesn't look right"}.`);
      continue;
    }
    seller[key] = checked.data;
    lines.push(`${SELLER_LABEL[key]}: ${company[key] || "not set"} → ${checked.data}`);
  }
  return { seller, lines, problems };
}

/**
 * The Your company page only edits the text on your letterhead: what is said
 * there is saved at once, with no plan to approve. Enquiries are never touched from here.
 */
async function saveFromCompanyPage(text: string): Promise<CommandResult> {
  const words = readQuoteText(text, { ownCompany: true });
  if (!words?.seller) {
    return { kind: "message", text: "This box changes your company details. Say, for example, “company name Shree Packaging”, “email …”, “GSTIN …”, “phone …” or “address …”." };
  }
  const { seller, lines, problems } = await checkSeller(words.seller);
  if (lines.length === 0) return { kind: "error", text: problems.join(" ") };
  const saved = await saveCompany(seller);
  if (!saved.ok) return { kind: "error", text: saved.error };
  return { kind: "message", text: [`Saved. ${lines.join("; ")}.`, ...problems].join(" ") };
}

async function makeQuoteTextPlan(words: QuoteText, path: string, text: string, pending: Plan | null): Promise<CommandResult> {
  if (pending && pending.action !== "quote_text") return { kind: "message", text: "A plan is waiting. Say “approve” or “cancel” for it first." };
  const { card } = await describeScreen(path);
  const lines: string[] = [];
  const warnings: string[] = [];
  let requestId: string | undefined;
  let seller: SellerWords | undefined;
  if (words.seller) {
    const checked = await checkSeller(words.seller);
    seller = checked.seller;
    lines.push(...checked.lines);
    warnings.push(...checked.problems);
    if (lines.length === 0) return { kind: "error", text: warnings.join(" ") };
    warnings.push("Shows on every quotation not yet sent. Sent ones keep the details they went out with.");
  }
  if (words.notes !== undefined) {
    if (!card) return { kind: "message", text: "Open the enquiry first, then say the notes." };
    const quote = await Quotation.findOne({ requestId: card.request._id }).sort({ createdAt: -1 });
    if (!quote) return { kind: "message", text: "There is no quotation on this enquiry yet. Say your rates first." };
    requestId = card.request._id.toString();
    lines.push(quote.notes ? `Notes: “${quote.notes}” → “${words.notes}”` : `Notes: “${words.notes}”`);
    if (quote.status === "Sent") lines.push(`${quote.number ?? "The quotation"} was sent, so this makes a new revision.`);
  }
  const view: PlanView = {
    title: seller ? "Change your company details" : `Notes on ${card?.state.ref ?? "the quotation"}`,
    lines,
    warnings,
    card: card && !seller ? previewCard(card.state) : undefined,
  };
  return savePlan("quote_text", view, { kind: "quote_text", requestId, notes: words.notes, seller }, text, {
    requestId: card?.request._id,
    replaces: pending,
  });
}

/** Adds the formula's working, notes and the totals to a new-enquiry plan. */
async function withPricing(view: PlanView, newCard: NewCard, existing: ExistingCustomer | null, priced: { lines: string[]; warnings: string[] }): Promise<void> {
  view.lines.push(...priced.lines);
  view.warnings.push(...priced.warnings);
  const customer = { ...(existing ?? {}), ...newCard.customer };
  const card = { ref: "New", stage: "New" as const, customer, terms: newCard.terms, boxes: newCard.boxes.map((specs, i) => ({ id: `new${i}`, specs })) };
  view.lines.push(...totalsLines(card, stateCodeOf(await getCompany())));
}

/** Same size, same box: the die and design from last time are used again, not charged again. */
function reuseTooling(copy: Specs, source: Specs, now: Specs): Specs {
  const sameBox = (["boxType", "length", "breadth", "height"] as const).every((k) => (now[k] ?? null) === (source[k] ?? null));
  if (!sameBox) return now;
  const out = { ...now };
  if (copy.cutting === undefined || now.cutting === copy.cutting) out.cutting = source.cutting === "Slitter" ? "Slitter" : "Existing die";
  if ((source.artwork === "We design" || source.artwork === "Existing") && (now.artwork === undefined || now.artwork === copy.artwork)) out.artwork = "Existing";
  return out;
}

function parseError(parsed: ParseResult): CommandResult {
  if (parsed.error && isProviderDailyLimit(parsed.error)) return { kind: "message", text: AI_LIMIT_MESSAGE };
  return { kind: "error", text: `Couldn't read that: ${parsed.error} Try again.` };
}

export async function handleCommand(text: string, path: string, planId?: string): Promise<CommandResult> {
  await connectDb();
  if (path.startsWith("/settings")) return saveFromCompanyPage(text);
  const pending = await waitingPlanFor(path, planId);
  const fast = fastCommand(text);

  if (fast === "approve") {
    if (pending) return applyPlan(pending);
    // "approve" on a card whose draft quotation is complete, after an earlier "cancel".
    const { card } = await describeScreen(path);
    const draft = card ? await Quotation.findOne({ requestId: card.request._id, status: "Draft" }) : null;
    if (card && draft && quoteGaps(card.state).forApproval.length === 0) {
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
    return { kind: "share", quotationId: quote._id.toString(), text: `Sending ${quote.number ?? "the quotation"}…` };
  }
  if (fast === "edit") {
    const { card } = await describeScreen(path);
    const quote = card ? await Quotation.findOne({ requestId: card.request._id }).sort({ createdAt: -1 }) : null;
    if (!card) return { kind: "message", text: "Open the enquiry first, then say “PDF edit karna hai”." };
    if (!quote) return { kind: "message", text: "There is no quotation on this enquiry yet. Say your rates first." };
    return {
      kind: "edit_mode",
      text: "Editing is on. Click any detail on the quotation and type, or say the change here: “box 2 ka rate 21”, “notes mein likho ex works Bhiwandi”, “hamari company ka naam Shree Packaging karo”.",
    };
  }
  const words = readQuoteText(text);
  if (words) return makeQuoteTextPlan(words, path, text, pending);
  if (fast === "undo") {
    if (pending && pending.action !== "approve_quote") return { kind: "message", text: "A plan is waiting. Say “approve” or “cancel” for it first, then “undo”." };
    return makeUndoPlan(path, text);
  }

  // Only what follows uses the AI, so only this counts towards the daily limit.
  if ((await nextSeq(aiCounterName(new Date()))) > aiDailyLimit(process.env.AI_DAILY_LIMIT)) return { kind: "message", text: AI_LIMIT_MESSAGE };

  let llm;
  try {
    llm = createLlm(llmEnvFromProcess());
  } catch (err) {
    if (err instanceof LlmConfigError) return { kind: "error", text: err.message };
    throw err;
  }

  const { screen, card: onScreen } = await describeScreen(path);
  // Only the plan on his screen can be corrected; anything else he says stands on its own.
  const earlier = pending && pending._id.toString() === planId ? earlierOf(pending) : null;
  const earlierCard = earlier?.requestId ? await loadCard(earlier.requestId) : null;
  const parsed = await parseCommand(text, llm, {
    screen: onScreen && onScreen.state.boxes.length > 1 ? `${screen} (${onScreen.state.boxes.length} boxes)` : screen,
    screenCompany: onScreen?.request.customerName,
    earlier: earlier?.heard.join(" "),
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
      const sources = lastQuote ? lastQuote.lines.map((l) => l.specs) : (lastCard?.items ?? []).map((i) => i.specs);
      if (sources.length === 0) return { kind: "message", text: `No earlier order found for ${customer.company}.` };

      // What he changes now goes on top of the copy: "box 2 …" to that box, plain fields to every box.
      const copied: Box[] = sources.map((src, i) => ({ id: String(i), specs: copyableSpecs(src) }));
      const changes = collectEdit({ ref: "", stage: "New", customer: {}, terms: {}, boxes: copied }, parsed.request ?? NOTHING, parsed.boxes, { allBoxes: true });
      const boxes = copied.map((b, i) => reuseTooling(b.specs, sources[i] ?? {}, { ...b.specs, ...(changes.set.find((c) => c.id === b.id)?.values ?? {}) }));
      const priced = priceNewCard({ customer: { company: customer.company }, terms: changes.terms, boxes: [...boxes, ...changes.add], warnings: changes.warnings }, await getPricing());
      const newCard = priced.card;
      const view = buildCreatePlan(newCard, parsed.unclear, toExisting(customer));
      await withPricing(view, newCard, toExisting(customer), priced);
      const when = lastQuote
        ? (lastQuote.approvedAt ?? lastQuote.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
        : "";
      const fromWhat = lastQuote ? `quotation ${lastQuote.number ?? ""} of ${when}` : `card ${lastCard?.number ? `REQ-${String(lastCard.number).padStart(3, "0")}` : ""}`;
      view.title = `Same as last time for ${customer.company}`;
      view.lines.unshift(`Copied from ${fromWhat.replace(/\s+/g, " ").trim()}`);
      view.warnings.unshift("Rates are worked out again by your formula; terms are not copied.");
      const ops: PlanOps = { kind: "create_request", customer: { company: customer.company }, terms: R(newCard.terms), boxes: newCard.boxes.map(R), heard, rawTexts };
      return savePlan("create_request", view, ops, text, { parseLogId: log._id, replaces: pending });
    }

    case "create_request": {
      if (!parsed.request) return { kind: "message", text: "Didn't catch a box request in that." };
      const priced = priceNewCard(collectCreate(parsed.request, parsed.boxes, cmd.allBoxes), await getPricing());
      const newCard = priced.card;
      const company = newCard.customer.company;
      const existing = typeof company === "string" ? await Customer.findOne({ companyKey: companyKey(company) }).lean() : null;
      const view = buildCreatePlan(newCard, parsed.unclear, toExisting(existing));
      await withPricing(view, newCard, toExisting(existing), priced);
      const ops: PlanOps = { kind: "create_request", customer: R(newCard.customer), terms: R(newCard.terms), boxes: newCard.boxes.map(R), heard, rawTexts };
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

      // Only the owner's own "set rate" command may carry a rate (the guard in parse already checked).
      const isRate = cmd.intent === "set_rate";
      const priced = priceEdit(card.state, collectEdit(card.state, parsed.request ?? NOTHING, parsed.boxes, { allBoxes: cmd.allBoxes, remove: cmd.remove }), await getPricing());
      const edit = priced.edit;
      // A rate the formula just worked out builds the quotation, the same as one he said.
      const quoted = isRate || edit.set.some((c) => typeof c.values.ratePerBox === "number") || edit.add.some((a) => typeof a.ratePerBox === "number");
      const view = buildEditPlan(card.state, edit, parsed.unclear, { rate: quoted, stateCode: stateCodeOf(await getCompany()), formula: priced.lines });
      view.warnings.push(...priced.warnings);
      view.warnings.unshift(...notes);
      if (view.empty) {
        await ParseLog.updateOne({ _id: log._id }, { outcome: "cancelled" });
        const why = view.warnings.length ? ` ${view.warnings.join(" ")}` : "";
        return { kind: "message", text: `Nothing to change on ${card.state.ref}.${why}` };
      }
      const ops: PlanOps = {
        kind: "edit_request",
        requestId: card.request._id.toString(),
        customer: R(edit.customer),
        terms: R(edit.terms),
        set: edit.set.map((c) => ({ id: c.id, values: R(c.values) })),
        add: edit.add.map(R),
        remove: edit.remove,
        quote: quoted,
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
