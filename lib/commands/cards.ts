import "server-only";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { boxMissing, cardMissing, companyKey, requestRef, type CardState } from "@/lib/card";
import { CUSTOMER_FIELD_KEYS, type Specs } from "@/lib/fields";
import { Customer, Request, type CardSnapshot, type CustomerDoc, type RequestDoc } from "@/lib/models";

/** Server helpers for finding a card and reading it with its customer. */

export interface LoadedCard {
  request: HydratedDocument<RequestDoc>;
  customer: HydratedDocument<CustomerDoc> | null;
  state: CardState;
}

/** The customer's fields as card values (company, contact, phone, GSTIN, address). */
export function customerSpecs(request: Pick<RequestDoc, "customerName">, customer: CustomerDoc | null): Specs {
  const specs: Specs = { company: customer?.company ?? request.customerName };
  for (const k of CUSTOMER_FIELD_KEYS) {
    if (k === "company") continue;
    const v = customer?.[k as keyof CustomerDoc];
    if (typeof v === "string" && v) specs[k] = v;
  }
  return specs;
}

export function cardState(request: Pick<RequestDoc, "number" | "stage" | "items" | "terms" | "customerName">, customer: CustomerDoc | null): CardState {
  return {
    ref: requestRef(request.number),
    stage: request.stage,
    customer: customerSpecs(request, customer),
    boxes: (request.items ?? []).map((i) => ({ id: i.id, specs: { ...i.specs } })),
    terms: { ...(request.terms ?? {}) },
  };
}

/** What "undo" needs to put the card back. */
export function snapshotOf(state: CardState): CardSnapshot {
  return {
    items: state.boxes.map((b) => ({ id: b.id, specs: { ...b.specs }, missing: [] })),
    terms: { ...state.terms },
    customer: { ...state.customer },
  };
}

export function stateFromSnapshot(snap: CardSnapshot, base: Pick<CardState, "ref" | "stage">): CardState {
  return {
    ...base,
    customer: { ...snap.customer },
    boxes: snap.items.map((i) => ({ id: i.id, specs: { ...i.specs } })),
    terms: { ...snap.terms },
  };
}

/**
 * Writes a card state onto the request and its customer documents (not saved).
 * Customer fields go to the customer record; renaming the company is not done here.
 */
export function writeCard(request: HydratedDocument<RequestDoc>, customer: HydratedDocument<CustomerDoc> | null, state: CardState): void {
  request.items = state.boxes.map((b) => ({ id: b.id, specs: b.specs, missing: [] }));
  request.terms = state.terms;
  request.markModified("items");
  request.markModified("terms");
  if (customer) {
    for (const k of CUSTOMER_FIELD_KEYS) {
      if (k === "company") continue;
      const v = state.customer[k];
      customer.set(k, typeof v === "string" && v ? v : undefined);
    }
  }
  refreshMissing(request, state);
}

/** Recomputes the per-box and card-level NOT SAID lists. */
export function refreshMissing(request: HydratedDocument<RequestDoc>, state: CardState): void {
  request.items = state.boxes.map((b) => ({ id: b.id, specs: b.specs, missing: boxMissing(b.specs) }));
  request.missing = cardMissing(state.customer, state.boxes);
  request.markModified("items");
}

export async function loadCard(id: string): Promise<LoadedCard | null> {
  if (!isValidObjectId(id)) return null;
  const request = await Request.findOne({ _id: id, deletedAt: null });
  if (!request) return null;
  const customer = await Customer.findById(request.customerId);
  return { request, customer, state: cardState(request, customer) };
}

/** The card id in a /quote/<id> path, if the command was spoken on a card. */
export function cardIdFromPath(path: string): string | null {
  const m = /^\/quote\/([0-9a-f]{24})(?:[/?#]|$)/i.exec(path);
  return m?.[1] ?? null;
}

/** How the screen is described to the LLM. */
export async function describeScreen(path: string): Promise<{ screen: string; card: LoadedCard | null }> {
  const id = cardIdFromPath(path);
  if (id) {
    const card = await loadCard(id);
    if (card) return { screen: `card ${card.state.ref} ${card.request.customerName}`, card };
  }
  if (path.startsWith("/quote/new")) return { screen: "new quote", card: null };
  if (path.startsWith("/board")) return { screen: "board", card: null };
  if (path.startsWith("/history")) return { screen: "quotation history", card: null };
  return { screen: "other", card: null };
}

export type TargetResult = { card: LoadedCard; note?: string } | { error: string };

/**
 * Which card a command means: "REQ 3" by number, a company name (its newest
 * open card), or the card on screen when no name was said.
 */
export async function resolveTarget(target: string | null, onScreen: LoadedCard | null): Promise<TargetResult> {
  if (!target) {
    return onScreen ? { card: onScreen } : { error: "Which card? Say the company name or the REQ number." };
  }
  const num = /\b(?:req|request|number|no)\D{0,3}0*(\d{1,5})\b/i.exec(target)?.[1];
  if (num) {
    const doc = await Request.findOne({ number: Number(num), deletedAt: null }).select("_id");
    const card = doc ? await loadCard(doc._id.toString()) : null;
    return card ? { card } : { error: `There is no REQ-${num.padStart(3, "0")}.` };
  }
  const key = companyKey(target);
  if (!key) return { error: "Which card? Say the company name or the REQ number." };
  const pattern = key.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  const matches = await Request.find({ customerKey: { $regex: pattern }, deletedAt: null })
    .sort({ updatedAt: -1 })
    .select("_id stage number customerName")
    .limit(20)
    .lean();
  if (matches.length === 0) return { error: `No card found for “${target}”.` };
  const open = matches.filter((m) => m.stage === "New" || m.stage === "Quoted" || m.stage === "Sent");
  const pick = open[0] ?? matches[0];
  if (!pick) return { error: `No card found for “${target}”.` };
  const card = await loadCard(pick._id.toString());
  if (!card) return { error: `No card found for “${target}”.` };
  const note =
    matches.length > 1
      ? `${matches.length} cards match “${target}”; using the newest${open.length ? " open" : ""} one, ${card.state.ref}.`
      : undefined;
  return { card, note };
}

/** A customer by a spoken name ("Sharma Packaging", "Gupta"): exact match first, then the most recent partial match. */
export async function findCustomer(spoken: string) {
  const key = companyKey(spoken);
  if (!key) return null;
  const exact = await Customer.findOne({ companyKey: key });
  if (exact) return exact;
  const pattern = key.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return Customer.findOne({ companyKey: { $regex: pattern } }).sort({ updatedAt: -1 });
}
