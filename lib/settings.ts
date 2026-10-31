import "server-only";
import { CompanyProfile, DEFAULT_COMPANY } from "@/lib/company";
import { connectDb } from "@/lib/db";
import { Setting } from "@/lib/models/Setting";
import { DEFAULT_RATES, PricingRates } from "@/lib/pricing/rates";

/** Your company's letterhead details: what is saved, filled in with the defaults. */
export async function getCompany(): Promise<CompanyProfile> {
  await connectDb();
  const doc = await Setting.findById("company").lean();
  const saved = CompanyProfile.partial().safeParse(doc?.value ?? {});
  const value = saved.success ? saved.data : {};
  const merged = { ...DEFAULT_COMPANY, ...value, bank: { ...DEFAULT_COMPANY.bank, ...(value.bank ?? {}) } };
  const parsed = CompanyProfile.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_COMPANY;
}

/** Saves changed letterhead details (checked before saving). */
export async function saveCompany(changes: Partial<CompanyProfile>): Promise<{ ok: true; company: CompanyProfile } | { ok: false; error: string }> {
  const current = await getCompany();
  const parsed = CompanyProfile.safeParse({ ...current, ...changes, bank: { ...current.bank, ...(changes.bank ?? {}) } });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Those details don't look right." };
  }
  await Setting.findByIdAndUpdate("company", { value: parsed.data }, { upsert: true });
  return { ok: true, company: parsed.data };
}

/** Your price list for the formula: what is saved, or the starting values. */
export async function getPricing(): Promise<PricingRates> {
  await connectDb();
  const doc = await Setting.findById("pricing").lean();
  const parsed = PricingRates.safeParse(doc?.value);
  return parsed.success ? parsed.data : DEFAULT_RATES;
}
