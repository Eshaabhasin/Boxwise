/**
 * All money is integer paise. The LLM never computes any of this.
 */

export type GstMode = "intra" | "inter";

export interface TotalsInput {
  quantity: number;
  ratePaise: number;
  gstPercent: number;
  /** "intra" (same state) splits GST into CGST + SGST; "inter" charges IGST. */
  mode: GstMode;
  /** Round the grand total to the nearest rupee and show the difference as round-off. */
  roundToRupee?: boolean;
}

export interface Totals {
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  gstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

/** Rupees as spoken (18, 18.5, "12.75") to paise, without float drift. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) throw new Error(`Invalid rupee amount: ${rupees}`);
  return Math.round(rupees * 100);
}

/** paise × basis points / 10000, rounded half up, in integers only. */
function pctOf(paise: number, basisPoints: number): number {
  return Math.floor((paise * basisPoints + 5000) / 10000);
}

export function computeTotals(input: TotalsInput): Totals {
  const { quantity, ratePaise, gstPercent, mode, roundToRupee = false } = input;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a whole number above 0");
  if (!Number.isInteger(ratePaise) || ratePaise < 0) throw new Error("Rate must be whole paise");
  if (!(gstPercent >= 0 && gstPercent <= 28)) throw new Error("GST % must be between 0 and 28");

  const subtotalPaise = quantity * ratePaise;
  const bp = Math.round(gstPercent * 100);
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (mode === "intra") {
    // Each half is rounded on its own, as it is printed on its own line.
    cgstPaise = pctOf(subtotalPaise, bp / 2);
    sgstPaise = cgstPaise;
  } else {
    igstPaise = pctOf(subtotalPaise, bp);
  }
  const gstPaise = cgstPaise + sgstPaise + igstPaise;
  const raw = subtotalPaise + gstPaise;
  const totalPaise = roundToRupee ? Math.round(raw / 100) * 100 : raw;
  return { subtotalPaise, cgstPaise, sgstPaise, igstPaise, gstPaise, roundOffPaise: totalPaise - raw, totalPaise };
}

/** "₹10,620.00" in Indian digit grouping. */
export function formatINR(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toLocaleString("en-IN");
  const p = String(abs % 100).padStart(2, "0");
  return `${sign}₹${rupees}.${p}`;
}

/** GST mode from the first two digits of the customer's GSTIN; unknown means same state. */
export function gstModeFor(customerGstin: string | undefined, companyStateCode: string): GstMode {
  const code = customerGstin?.slice(0, 2);
  return code && /^\d{2}$/.test(code) && code !== companyStateCode ? "inter" : "intra";
}
