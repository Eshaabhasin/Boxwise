import { SPOKEN_FIELD_DEFS, type FieldKey, type Specs } from "@/lib/fields";

/**
 * "Same as last time for Sharma Packaging": what is copied from the last order.
 * The box spec and quantity are copied; the rate, GST and terms never are
 * (golden rule 3: the rate is only what the owner says, each time).
 */
export function copyableSpecs(source: Specs): Specs {
  const out: Specs = {};
  for (const f of SPOKEN_FIELD_DEFS) {
    const k = f.key as FieldKey;
    if (f.onCustomer || f.ownerOnly || f.requiredAt === "quote") continue;
    const v = source[k];
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}
