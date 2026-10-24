import { z } from "zod";
import { buildCardView, type BoxCardView } from "@/lib/board";
import { formatSize, isLengthUnit, fromMm } from "@/lib/calc/units";
import { FIELD_DEFS, missingFields, getField, type FieldKey, type SpecValue, type Specs } from "@/lib/fields";
import type { GuardedRequest } from "@/lib/nlp/guard";

/** What a "create request" plan will do when approved. Stored on the pending plan and checked again before applying. */
export const CreateRequestOps = z.object({
  kind: z.literal("create_request"),
  customer: z.record(z.string(), z.string()),
  specs: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  /** Normalized text of every utterance in this plan, oldest first. */
  heard: z.array(z.string()),
  /** What was dictated, word for word, oldest first. */
  rawTexts: z.array(z.string()),
});
export type CreateRequestOps = z.infer<typeof CreateRequestOps>;

/** "Sharma Packaging" -> "sharma packaging"; used to match a customer said twice. */
export function companyKey(company: string): string {
  return (company.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

export interface ExistingCustomer {
  company: string;
  contactPerson?: string;
  phone?: string;
  gstin?: string;
  address?: string;
}

export interface PlanView {
  title: string;
  lines: string[];
  warnings: string[];
  card: BoxCardView;
}

function display(key: FieldKey, value: SpecValue, specs: Specs): string {
  const f = getField(key);
  if (value === null) return "—";
  if (f?.kind === "length" && typeof value === "number") {
    const unit = isLengthUnit(specs.dimUnit) ? specs.dimUnit : "mm";
    return `${fromMm(value, unit)} ${unit}`;
  }
  if (key === "printColours") return value === 0 ? "plain (no print)" : `${value}-colour`;
  if (key === "loadKg") return `${value} kg`;
  if (key === "quantity" && typeof value === "number") return value.toLocaleString("en-IN");
  if (key === "gstPercent") return `${value}%`;
  return String(value);
}

/**
 * The plan he reads before saying "approve": one line per value that will be
 * saved, what was not said, and anything that was heard but dropped.
 */
export function buildCreatePlan(
  guarded: GuardedRequest,
  unclear: readonly string[],
  existing: ExistingCustomer | null,
): PlanView {
  const lines: string[] = [];
  const warnings: string[] = [];
  const { customer, specs } = guarded;
  const company = customer.company ?? existing?.company;

  if (company) {
    lines.push(existing ? `Customer: ${existing.company} (already in your list)` : `Customer: ${company} (new customer)`);
  }
  for (const key of ["contactPerson", "phone", "gstin", "address"] as const) {
    const v = customer[key];
    if (!v) continue;
    const label = getField(key)?.label ?? key;
    const before = existing?.[key];
    lines.push(before && before !== v ? `${label}: ${v} (was ${before})` : `${label}: ${v}`);
  }

  const size = formatSize(
    typeof specs.length === "number" ? specs.length : null,
    typeof specs.breadth === "number" ? specs.breadth : null,
    typeof specs.height === "number" ? specs.height : null,
    isLengthUnit(specs.dimUnit) ? specs.dimUnit : "mm",
  );
  if (size) lines.push(`Size: ${size.replace(/ IN$/, " inch").replace(/ MM$/, " mm").replace(/ CM$/, " cm")}`);

  for (const f of FIELD_DEFS) {
    const key = f.key as FieldKey;
    if (f.onCustomer || f.kind === "length" || key === "dimUnit") continue;
    const v = specs[key];
    if (v === undefined) continue;
    lines.push(`${f.label}: ${display(key, v, specs)}`);
  }

  if (guarded.sizeWithoutUnit) {
    const s = guarded.sizeWithoutUnit;
    warnings.push(
      `Size ${[s.length, s.breadth, s.height].map((n) => n ?? "?").join(" × ")} has no unit. Say “inch”, “cm” or “mm”, or it won't be saved.`,
    );
  }
  for (const d of guarded.dropped) {
    const label = getField(d.field)?.label ?? d.field;
    warnings.push(`Left out ${label} “${d.value}”: ${d.reason}.`);
  }
  for (const note of unclear) warnings.push(`Unclear: ${note}`);
  if (!company) warnings.push("No company name heard. Say the customer's company name.");

  const known: Specs = { ...specs, ...customer, ...(existing ?? {}) };
  const missing = missingFields(known, "card");
  if (missing.length > 0) {
    const labels = [...new Set(missing.map((k) => (["length", "breadth", "height"].includes(k) ? "Size" : getField(k)?.label ?? k)))];
    lines.push(`Not said: ${labels.join(", ")}`);
  }

  return {
    title: company ? `New box card for ${company}` : "New box card",
    lines,
    warnings,
    card: buildCardView({ id: "preview", customerName: company ?? "Company not said", stage: "New", specs, missing }),
  };
}
