import { fromMm, isLengthUnit } from "@/lib/calc/units";
import { FIELD_DEFS, FIELD_GROUPS, type FieldKey, type SpecValue, type Specs } from "@/lib/fields";

function show(key: FieldKey, value: SpecValue | undefined, specs: Specs): string | null {
  if (value === undefined || value === null || value === "") return null;
  const def = FIELD_DEFS.find((f) => f.key === key);
  if (def?.kind === "length" && typeof value === "number") {
    const unit = isLengthUnit(specs.dimUnit) ? specs.dimUnit : "mm";
    return `${fromMm(value, unit)} ${unit}`;
  }
  if (key === "printColours") return value === 0 ? "Plain" : `${value}-colour`;
  if (key === "loadKg") return `${value} kg`;
  if (key === "gstPercent") return `${value}%`;
  if (key === "quantity" && typeof value === "number") return value.toLocaleString("en-IN");
  if (def?.kind === "money" && typeof value === "number") return `₹${(value / 100).toFixed(2)}`;
  return String(value);
}

/** Every field of a request card, grouped as in lib/fields.ts, with gaps stamped NOT SAID. */
export default function CardDetail({
  specs,
  missing,
  rawTexts,
}: {
  /** Card specs merged with the customer's fields. */
  specs: Specs;
  missing: readonly FieldKey[];
  rawTexts: readonly string[];
}) {
  const missingSet = new Set(missing);
  return (
    <section className="hard-shadow border-2 border-ink bg-kraft-2">
      <div className="flap h-6 border-b-2 border-ink" />
      <div className="divide-y-2 divide-dashed divide-ink/30 px-4">
        {FIELD_GROUPS.map((group) => {
          const fields = FIELD_DEFS.filter((f) => f.group === group.key && f.key !== "dimUnit" && f.requiredAt !== "quote");
          if (fields.length === 0) return null;
          return (
            <div key={group.key} className="py-4">
              <p className="eyebrow text-ink-2">{group.label}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                {fields.map((f) => {
                  const key = f.key as FieldKey;
                  const value = show(key, specs[key], specs);
                  const isMissing = missingSet.has(key);
                  return (
                    <div key={key} className={key === "address" ? "col-span-2 sm:col-span-3" : undefined}>
                      <dt className="eyebrow text-[0.6rem] text-ink-2">{f.label}</dt>
                      <dd className="font-display text-lg font-extrabold leading-tight tracking-tight">
                        {value ?? (
                          isMissing ? (
                            <span className="eyebrow inline-block -rotate-2 border-2 border-brick px-1.5 py-0.5 text-[0.6rem] font-bold text-brick">
                              Not said
                            </span>
                          ) : (
                            <span className="text-ink-2/50">—</span>
                          )
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
        {rawTexts.length > 0 && (
          <div className="py-4">
            <p className="eyebrow text-ink-2">What was dictated</p>
            <ol className="mt-2 space-y-1.5 font-mono text-xs leading-relaxed">
              {rawTexts.map((t, i) => (
                <li key={i} className="border-l-2 border-ink/30 pl-2">
                  {t}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="flap h-3 border-t-2 border-ink" />
    </section>
  );
}
