import { z } from "zod";

export const APP_NAME = "Boxwise";
export const APP_TAGLINE = "Quotations for box makers";

/**
 * Your company's details for the quotation letterhead. Edited on the
 * Settings page, on the quotation itself, or by voice; stored in the
 * database. These are only the starting values.
 */
export const CompanyProfile = z.object({
  name: z.string().trim().min(1, "Company name is needed").max(120),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(120),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .max(15)
    .refine((g) => g === "" || /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(g), "GSTIN should be 15 characters, like 27AAPFU0939F1ZV"),
  /** Prefix of the quotation number, e.g. BB/2026-27/0001. */
  quotePrefix: z.string().trim().min(1).max(10).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and - only"),
  bank: z.object({
    name: z.string().trim().max(120),
    accountName: z.string().trim().max(120),
    accountNumber: z.string().trim().max(40),
    ifsc: z.string().trim().toUpperCase().max(11),
  }),
});
export type CompanyProfile = z.infer<typeof CompanyProfile>;

export const DEFAULT_COMPANY: CompanyProfile = {
  name: "Your Company Name",
  address: "Plot / street, City, State PIN",
  phone: "+91 00000 00000",
  email: "",
  gstin: "",
  quotePrefix: "BB",
  bank: { name: "", accountName: "", accountNumber: "", ifsc: "" },
};

/** Maharashtra, used until your GSTIN is filled in. */
const DEFAULT_STATE_CODE = "27";

/**
 * First two digits of your GSTIN: they decide CGST+SGST (customer in the same
 * state) or IGST (another state).
 */
export function stateCodeOf(company: Pick<CompanyProfile, "gstin">): string {
  return /^\d{2}/.test(company.gstin) ? company.gstin.slice(0, 2) : DEFAULT_STATE_CODE;
}

/** The lines under the company name on the letterhead. */
export function letterheadLines(company: CompanyProfile): string[] {
  return [company.address, [company.phone, company.email].filter(Boolean).join(" · "), company.gstin ? `GSTIN ${company.gstin}` : ""].filter(Boolean);
}
