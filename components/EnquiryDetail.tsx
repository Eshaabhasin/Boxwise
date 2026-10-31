import { boxLabel, display, sizeText } from "@/lib/card";
import { SPOKEN_FIELD_DEFS, getField, scopeOf, type FieldKey, type Specs } from "@/lib/fields";

interface Props {
  customer: Specs;
  boxes: { id: string; specs: Specs; missing: readonly FieldKey[] }[];
  terms: Specs;
  /** Card-level gaps (customer fields). */
  missing: readonly FieldKey[];
  rawTexts: readonly string[];
}

const SIDES = new Set(["length", "breadth", "height", "dimUnit"]);

function Missing({ keys }: { keys: readonly FieldKey[] }) {
  const labels = [...new Set(keys.map((k) => (SIDES.has(k) ? "Size" : (getField(k)?.label ?? k))))];
  if (labels.length === 0) return null;
  return (
    <p className="mt-3 flex flex-wrap gap-1.5">
      {labels.map((l) => (
        <span key={l} className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
          {l} not said
        </span>
      ))}
    </p>
  );
}

/** The enquiry as heard: customer, each box, terms, and what was dictated. */
export default function EnquiryDetail({ customer, boxes, terms, missing, rawTexts }: Props) {
  const customerFields = SPOKEN_FIELD_DEFS.filter((f) => scopeOf(f) === "customer" && f.key !== "company");
  const boxFields = SPOKEN_FIELD_DEFS.filter((f) => scopeOf(f) === "item" && !SIDES.has(f.key));
  const termFields = SPOKEN_FIELD_DEFS.filter((f) => scopeOf(f) === "quote");

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-4">
        <p className="label-xs">Customer</p>
        <p className="mt-1 font-display text-lg font-semibold">{String(customer.company ?? "")}</p>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {customerFields.map((f) => {
            const v = customer[f.key as FieldKey];
            if (v === undefined || v === null || v === "") return null;
            return (
              <div key={f.key} className="flex gap-2">
                <dt className="text-ink-3">{f.label}</dt>
                <dd>{String(v)}</dd>
              </div>
            );
          })}
        </dl>
        <Missing keys={missing.filter((k) => { const f = getField(k); return f !== undefined && scopeOf(f) === "customer"; })} />
      </section>

      {boxes.map((b, i) => {
        const size = sizeText(b.specs);
        return (
          <section key={b.id} className="panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-display text-base font-semibold">{boxLabel(i)}</p>
              {size && <p className="text-sm font-medium tabular-nums">{size}</p>}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {boxFields.map((f) => {
                const v = b.specs[f.key as FieldKey];
                if (v === undefined || v === null || v === "") return null;
                return (
                  <div key={f.key} className="flex flex-col">
                    <dt className="text-xs text-ink-3">{f.label}</dt>
                    <dd className="font-medium tabular-nums">{display(f.key as FieldKey, v, b.specs)}</dd>
                  </div>
                );
              })}
            </dl>
            <Missing keys={b.missing} />
          </section>
        );
      })}

      <section className="panel p-4">
        <p className="label-xs">Terms</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {termFields.map((f) => {
            const v = terms[f.key as FieldKey];
            return (
              <div key={f.key} className="flex flex-col">
                <dt className="text-xs text-ink-3">{f.label}</dt>
                <dd className={v === undefined || v === null || v === "" ? "text-ink-3" : "font-medium"}>{v === undefined || v === null || v === "" ? "—" : display(f.key as FieldKey, v, terms)}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      {rawTexts.length > 0 && (
        <details className="panel p-4 text-sm">
          <summary className="cursor-pointer font-medium text-ink-2">What was dictated ({rawTexts.length})</summary>
          <ol className="mt-2 space-y-1.5 text-ink-2">
            {rawTexts.map((t, i) => (
              <li key={i} className="border-l-2 border-line pl-2">
                {t}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
