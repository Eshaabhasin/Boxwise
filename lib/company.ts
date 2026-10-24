/**
 * Your father's company details for the PDF letterhead.
 * PLACEHOLDERS: replace with the real values before the first real quotation.
 */
export const APP_NAME = "BoxBol";
export const APP_TAGLINE = "Bolo, quote ready.";

export const COMPANY = {
  name: "Your Company Name",
  addressLines: ["Plot / street", "City, State PIN"],
  phone: "+91 00000 00000",
  email: "",
  gstin: "",
  /** First two digits of the GSTIN. Decides CGST+SGST (same state) or IGST (other state). */
  stateCode: "27",
  bank: {
    name: "",
    accountName: "",
    accountNumber: "",
    ifsc: "",
  },
  /** Prefix of the quotation number, e.g. BB/2026-27/0001 */
  quotePrefix: "BB",
} as const;
