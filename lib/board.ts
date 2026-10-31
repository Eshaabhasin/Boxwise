import { boxLabel, boxSummary } from "@/lib/card";
import { getField, STAGES, type FieldKey, type Specs, type Stage } from "@/lib/fields";

/**
 * Board filters. "Pending" is every open request (New, Quoted, Sent); each card
 * carries a "waiting on" tag that says what it is stuck on.
 */
export const BOARD_FILTERS = ["Pending", "New", "Quoted", "Sent", "Won", "Lost", "All"] as const;
export type BoardFilter = (typeof BOARD_FILTERS)[number];
export const DEFAULT_FILTER: BoardFilter = "Pending";

export const OPEN_STAGES: readonly Stage[] = ["New", "Quoted", "Sent"];

export function isBoardFilter(value: unknown): value is BoardFilter {
  return BOARD_FILTERS.some((f) => f === value);
}

/** The stages a filter shows. */
export function stagesFor(filter: BoardFilter): readonly Stage[] {
  if (filter === "All") return STAGES;
  if (filter === "Pending") return OPEN_STAGES;
  return [filter];
}

/** Count for each filter chip, given the count per stage. */
export function filterCounts(perStage: Readonly<Record<Stage, number>>): Record<BoardFilter, number> {
  const sum = (stages: readonly Stage[]) => stages.reduce((n, s) => n + perStage[s], 0);
  return Object.fromEntries(BOARD_FILTERS.map((f) => [f, sum(stagesFor(f))])) as Record<BoardFilter, number>;
}

export const WAITING_ON = ["Customer info", "Your rate", "Your approval", "Sharing", "Customer reply"] as const;
export type WaitingOn = (typeof WAITING_ON)[number];

/**
 * What an open request is waiting on:
 *   New, card has gaps          → Customer info (ask the customer)
 *   New, card complete          → Your rate
 *   New, draft quotation exists → Your approval (of the PDF)
 *   Quoted (approved PDF)       → Sharing (send it on WhatsApp)
 *   Sent                        → Customer reply
 * Won and Lost are closed, so they wait on nothing.
 */
export function waitingOn(stage: Stage, missingCount: number, hasDraftQuote: boolean): WaitingOn | null {
  switch (stage) {
    case "New":
      if (hasDraftQuote) return "Your approval";
      return missingCount > 0 ? "Customer info" : "Your rate";
    case "Quoted":
      return "Sharing";
    case "Sent":
      return "Customer reply";
    default:
      return null;
  }
}

export interface BoxLine {
  label: string;
  summary: string;
}

export interface BoxCardView {
  id: string;
  /** REQ-016 style label, when the enquiry has a number. */
  ref: string | null;
  company: string;
  stage: Stage;
  boxCount: number;
  /** The first few boxes, one line each. */
  boxes: BoxLine[];
  /** Total pieces across all boxes, e.g. "3,500". */
  totalQuantity: string | null;
  /** Short labels of anything not said yet, e.g. ["Flute", "Address"]. */
  missing: string[];
  waitingOn: WaitingOn | null;
}

export interface CardSource {
  id: string;
  number?: number;
  /** Used instead of number for previews ("New"). */
  ref?: string;
  customerName: string;
  stage: Stage;
  boxes: readonly { specs: Specs }[];
  missing: readonly FieldKey[];
  hasDraftQuote?: boolean;
}

const SHORT_LABEL: Partial<Record<FieldKey, string>> = {
  length: "Size",
  breadth: "Size",
  height: "Size",
  dimUnit: "Unit",
  style: "Style",
  printColours: "Print",
  loadKg: "Load",
  quantity: "Qty",
};

const SHOWN_BOXES = 3;

/** Turns a stored enquiry into what its card on the board shows. */
export function buildCardView(src: CardSource): BoxCardView {
  const labels: string[] = [];
  for (const key of src.missing) {
    const label = SHORT_LABEL[key] ?? getField(key)?.label ?? key;
    if (!labels.includes(label)) labels.push(label);
  }
  const quantities = src.boxes.map((b) => b.specs.quantity).filter((q): q is number => typeof q === "number");
  const total = quantities.reduce((a, b) => a + b, 0);
  return {
    id: src.id,
    ref: src.ref ?? (src.number ? `REQ-${String(src.number).padStart(3, "0")}` : null),
    company: src.customerName,
    stage: src.stage,
    boxCount: src.boxes.length,
    boxes: src.boxes.slice(0, SHOWN_BOXES).map((b, i) => ({ label: boxLabel(i), summary: boxSummary(b.specs) })),
    totalQuantity: quantities.length ? total.toLocaleString("en-IN") : null,
    missing: labels,
    waitingOn: waitingOn(src.stage, src.missing.length, src.hasDraftQuote ?? false),
  };
}

/** Words said around a search that aren't part of the name ("Sharma dhundo", "search for Gupta Foods ka card"). */
const SEARCH_FILLER =
  /^(?:please\s+)?(?:search(?:\s+for)?|find|show(?:\s+me)?|open|look\s+for)\s+|\s+(?:ka|ki|ke|wala|wali|wale)?\s*(?:card|enquiry|enquiries|quotation|quote)?\s*(?:dhundo|dhoondo|dhundho|khojo|dikhao|kholo|search karo|find karo)?$/i;

/** What a spoken or typed search looks for: an enquiry number ("REQ 4") or part of a company name. */
export function searchTerms(raw: string): { number?: number; company?: string } {
  let q = raw.trim().replace(/[.?!]+$/, "").replace(/\s+/g, " ");
  for (let prev = ""; prev !== q; ) {
    prev = q;
    q = q.replace(SEARCH_FILLER, "").trim();
  }
  const ref = /^(?:req|request|enquiry)[\s-]*0*(\d{1,6})$/i.exec(q);
  if (ref) return { number: Number(ref[1]) };
  return q ? { company: q } : {};
}
