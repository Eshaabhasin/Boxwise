import "server-only";
import type { HydratedDocument } from "mongoose";
import { CreateRequestOps, buildCreatePlan, companyKey, type ExistingCustomer } from "@/lib/commands/plan";
import { fastCommand } from "@/lib/commands/fastpath";
import { BoxCardViewSchema, type CommandResult } from "@/lib/commands/types";
import { connectDb } from "@/lib/db";
import { CUSTOMER_FIELD_KEYS, missingFields, type FieldKey, type Specs } from "@/lib/fields";
import { Customer, ParseLog, PendingPlan, Request, nextSeq, type PendingPlanDoc } from "@/lib/models";
import { LlmConfigError, createLlm, llmEnvFromProcess } from "@/lib/nlp/llm";
import { parseRequest } from "@/lib/nlp/parse";

/**
 * Runs one dictated command. Nothing is ever changed here except by "approve"
 * applying a plan the owner has already seen (golden rule 4).
 *
 * Phase 2 understands: a new request (-> plan), a spoken correction to the
 * waiting plan, approve, cancel. Edits, search, rate and undo come later.
 */

const PLAN_TTL_MS = 24 * 60 * 60 * 1000;

function toExisting(doc: { company: string; contactPerson?: string; phone?: string; gstin?: string; address?: string } | null): ExistingCustomer | null {
  if (!doc) return null;
  return { company: doc.company, contactPerson: doc.contactPerson, phone: doc.phone, gstin: doc.gstin, address: doc.address };
}

async function latestPendingPlan() {
  return PendingPlan.findOne({ status: "pending", expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
}

/** The waiting plan, as the command box shows it (used when a screen loads). */
export async function getPendingPlanResult(): Promise<CommandResult | null> {
  await connectDb();
  const plan = await latestPendingPlan();
  if (!plan) return null;
  return planResult(plan);
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

async function makeCreatePlan(text: string, earlier: HydratedDocument<PendingPlanDoc> | null): Promise<CommandResult> {
  const llm = createLlm(llmEnvFromProcess());
  const earlierOps = earlier ? CreateRequestOps.safeParse(earlier.ops) : null;
  const earlierHeard = earlierOps?.success ? earlierOps.data.heard.join(" ") : undefined;
  const parsed = await parseRequest(text, llm, earlierHeard);

  const log = await ParseLog.create({
    text,
    normalized: parsed.normalized,
    screen: "command",
    provider: llm.provider,
    model: llm.model,
    llmRaw: parsed.llmRaw,
    llmParsed: parsed.llmParsed,
    dropped: parsed.request?.dropped.map((d) => `${d.field}=${d.value}: ${d.reason}`) ?? [],
    outcome: parsed.error ? "error" : "pending",
    error: parsed.error ?? undefined,
    latencyMs: parsed.latencyMs,
  });

  if (parsed.error) {
    return { kind: "error", text: `Couldn't read that: ${parsed.error} Try again.` };
  }
  if (parsed.intent !== "create_request" || !parsed.request) {
    return {
      kind: "message",
      text: earlier
        ? "That didn't sound like a correction. Say the change (“600 box”, “B flute”), or “approve” or “cancel”."
        : "So far BoxBol makes new request cards. Searching, edits and rates come in the next phases.",
    };
  }

  const guarded = parsed.request;
  const company = guarded.customer.company;
  const existingDoc = company ? await Customer.findOne({ companyKey: companyKey(company) }).lean() : null;
  const view = buildCreatePlan(guarded, parsed.unclear, toExisting(existingDoc));

  const prior = earlierOps?.success ? earlierOps.data : null;
  const ops: CreateRequestOps = {
    kind: "create_request",
    customer: Object.fromEntries(Object.entries(guarded.customer).filter((e): e is [string, string] => typeof e[1] === "string")),
    specs: Object.fromEntries(Object.entries(guarded.specs).filter(([, v]) => v !== undefined)) as CreateRequestOps["specs"],
    heard: [...(prior?.heard ?? []), parsed.normalized],
    rawTexts: [...(prior?.rawTexts ?? []), text],
  };

  if (earlier) {
    earlier.status = "superseded";
    await earlier.save();
    if (earlier.parseLogId) {
      await ParseLog.updateOne({ _id: earlier.parseLogId }, { outcome: "corrected", $push: { corrections: text } });
    }
  }

  const plan = await PendingPlan.create({
    action: "create_request",
    lines: view.lines,
    ops: { ...ops, view: { title: view.title, warnings: view.warnings, card: view.card } },
    sourceText: text,
    parseLogId: log._id,
    status: "pending",
    expiresAt: new Date(Date.now() + PLAN_TTL_MS),
  });
  await ParseLog.updateOne({ _id: log._id }, { planLines: view.lines });
  return planResult(plan);
}

async function applyCreate(plan: HydratedDocument<PendingPlanDoc>): Promise<CommandResult> {
  const parsedOps = CreateRequestOps.safeParse(plan.ops);
  if (!parsedOps.success) return { kind: "error", text: "That plan can't be applied (it was damaged). Dictate it again." };
  const ops = parsedOps.data;
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
  const known: Specs = {
    ...specs,
    company: customer.company,
    contactPerson: customer.contactPerson,
    phone: customer.phone,
    gstin: customer.gstin,
    address: customer.address,
  };
  const now = new Date();
  const number = await nextSeq("request");
  const request = await Request.create({
    number,
    customerId: customer._id,
    customerName: customer.company,
    customerKey: key,
    stage: "New",
    specs,
    missing: missingFields(known, "card"),
    rawTexts: ops.rawTexts.map((t) => ({ text: t, at: now })),
    history: [
      {
        planId: plan._id,
        summary: "Card made from dictation",
        changes: Object.entries(specs).map(([field, after]) => ({ field: field as FieldKey, before: null, after: after ?? null })),
        stageAfter: "New",
        undone: false,
        at: now,
      },
    ],
  });

  plan.status = "applied";
  plan.requestId = request._id;
  await plan.save();
  if (plan.parseLogId) await ParseLog.updateOne({ _id: plan.parseLogId }, { outcome: "approved", requestId: request._id });

  return {
    kind: "message",
    text: `Saved REQ-${String(number).padStart(3, "0")} for ${customer.company}.`,
    navigateTo: `/quote/${request._id.toString()}`,
  };
}

export async function handleCommand(text: string): Promise<CommandResult> {
  await connectDb();
  const pending = await latestPendingPlan();
  const fast = fastCommand(text);

  if (fast === "approve") {
    if (!pending) return { kind: "message", text: "Nothing is waiting for approval." };
    if (pending.action === "create_request") return applyCreate(pending);
    return { kind: "error", text: "That kind of plan can't be applied yet." };
  }
  if (fast === "cancel") {
    if (!pending) return { kind: "message", text: "Nothing to cancel." };
    pending.status = "cancelled";
    await pending.save();
    if (pending.parseLogId) await ParseLog.updateOne({ _id: pending.parseLogId }, { outcome: "cancelled" });
    return { kind: "message", text: "Dropped. Nothing was saved." };
  }
  if (fast === "undo") {
    return { kind: "message", text: "Undo comes in phase 3, with voice edits." };
  }

  try {
    return await makeCreatePlan(text, pending && pending.action === "create_request" ? pending : null);
  } catch (err) {
    if (err instanceof LlmConfigError) return { kind: "error", text: err.message };
    throw err;
  }
}
