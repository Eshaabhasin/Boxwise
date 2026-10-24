import { getField, STAGES, type FieldKey, type Specs, type Stage } from "@/lib/fields";
import { formatSize, isLengthUnit } from "@/lib/calc/units";

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

export interface BoxCardView {
  id: string;
  /** REQ-016 style label, when the request has a number. */
  ref: string | null;
  company: string;
  stage: Stage;
  size: string | null;
  ply: string | null;
  load: string | null;
  quantity: string | null;
  print: string | null;
  /** Short labels of missing card fields, e.g. ["Flute", "Joint"]. */
  missing: string[];
  waitingOn: WaitingOn | null;
}

export interface CardSource {
  id: string;
  number?: number;
  customerName: string;
  stage: Stage;
  specs: Specs;
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

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Turns a stored request into what the box card shows. */
export function buildCardView(src: CardSource): BoxCardView {
  const s = src.specs;
  const unit = isLengthUnit(s.dimUnit) ? s.dimUnit : "inch";
  const ply = num(s.ply);
  const load = num(s.loadKg);
  const qty = num(s.quantity);
  const colours = num(s.printColours);

  const labels: string[] = [];
  for (const key of src.missing) {
    const label = SHORT_LABEL[key] ?? getField(key)?.label ?? key;
    if (!labels.includes(label)) labels.push(label);
  }

  return {
    id: src.id,
    ref: src.number ? `REQ-${String(src.number).padStart(3, "0")}` : null,
    company: src.customerName,
    stage: src.stage,
    size: formatSize(num(s.length), num(s.breadth), num(s.height), unit),
    ply: ply === null ? null : String(ply),
    load: load === null ? null : `${load} KG`,
    quantity: qty === null ? null : qty.toLocaleString("en-IN"),
    print: colours === null ? null : colours === 0 ? "Plain" : `${colours}-colour`,
    missing: labels,
    waitingOn: waitingOn(src.stage, src.missing.length, src.hasDraftQuote ?? false),
  };
}
