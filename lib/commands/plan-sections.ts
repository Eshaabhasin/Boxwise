/**
 * Sorts a plan's lines for the screen: what was understood, how each rate was
 * worked out (for him only, folded away), and the bill.
 * Pure: the lines stay the one record of the plan.
 */

export interface PlanSections {
  /** "Customer" → "Gupta Foods"; a line with no label has an empty one. */
  details: { label: string; value: string }[];
  notSaid: string | null;
  working: { label: string; steps: string[] }[];
  bill: { label: string; amount: string; total?: boolean }[];
}

const MONEY = String.raw`-?₹[\d,]+\.\d{2}`;
const LINE_AMOUNT = new RegExp(String.raw`^(?:(.+?):\s*)?([\d,]+) × (${MONEY}) = (${MONEY})$`);
const BILL_ROW = new RegExp(String.raw`^((?:Cutting die|Print design|CGST|IGST|Round off|Total).*?): (${MONEY})$`);
/** A rate's working: on the plan only, never in the card's history. */
export const WORKING = /^(?:(.+?): )?formula: (.+)$/;

export function planSections(lines: readonly string[]): PlanSections {
  const out: PlanSections = { details: [], notSaid: null, working: [], bill: [] };
  for (const line of lines) {
    const working = WORKING.exec(line);
    if (working) {
      out.working.push({ label: working[1] ?? "This box", steps: (working[2] ?? "").split(" · ") });
      continue;
    }
    if (line.startsWith("Not said: ")) {
      out.notSaid = line.slice("Not said: ".length);
      continue;
    }
    const amount = LINE_AMOUNT.exec(line);
    if (amount) {
      const what = `${amount[2]} × ${amount[3]}`;
      out.bill.push({ label: amount[1] ? `${amount[1]} · ${what}` : what, amount: amount[4] ?? "" });
      continue;
    }
    const row = BILL_ROW.exec(line);
    if (row) {
      const label = row[1] ?? "";
      out.bill.push({ label, amount: row[2] ?? "", total: label.startsWith("Total") });
      continue;
    }
    const colon = line.indexOf(": ");
    if (colon > 0 && colon < 30) out.details.push({ label: line.slice(0, colon), value: line.slice(colon + 2) });
    else out.details.push({ label: "", value: line });
  }
  return out;
}
