import "server-only";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import { companyKey, requestRef, type CardState } from "@/lib/commands/plan";
import { CUSTOMER_FIELD_KEYS, missingFields, type FieldKey, type Specs } from "@/lib/fields";
import { Customer, Request, type CustomerDoc, type RequestDoc } from "@/lib/models";

/** Server helpers for finding a card and reading it with its customer. */

export interface LoadedCard {
  request: HydratedDocument<RequestDoc>;
  customer: HydratedDocument<CustomerDoc> | null;
  state: CardState;
}

/** Card specs merged with the customer's fields, as the plan builders and missing flags need them. */
export function mergedSpecs(request: Pick<RequestDoc, "specs" | "customerName">, customer: CustomerDoc | null): Specs {
  const specs: Specs = { ...request.specs, company: customer?.company ?? request.customerName };
  for (const k of CUSTOMER_FIELD_KEYS) {
    if (k === "company") continue;
    const v = customer?.[k as keyof CustomerDoc];
    if (typeof v === "string" && v) specs[k] = v;
  }
  return specs;
}

export function cardMissing(specs: Specs): FieldKey[] {
  return missingFields(specs, "card");
}

export async function loadCard(id: string): Promise<LoadedCard | null> {
  if (!isValidObjectId(id)) return null;
  const request = await Request.findOne({ _id: id, deletedAt: null });
  if (!request) return null;
  const customer = await Customer.findById(request.customerId);
  return {
    request,
    customer,
    state: { ref: requestRef(request.number), stage: request.stage, specs: mergedSpecs(request, customer) },
  };
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
