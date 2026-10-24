import CommandBox from "@/components/CommandBox";
import SayButton from "@/components/SayButton";
import { formatINR } from "@/lib/calc/money";

export interface QuotationViewData {
  quoteNumber?: string;
  date: string;
  company: string;
  customerLines: string[];
  quantity: number;
  ratePaise: number;
  gstPercent: number;
  gstMode: "intra" | "inter";
  itemTitle: string;
  itemDetail: string;
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  terms: { deliveryTime: string; paymentTerms: string; validity: string };
  message: string;
  status: "Draft" | "Approved" | "Sent";
  /** Labels of quote fields still unsaid; approval waits for them. */
  stillNeeded: string[];
  letterhead: { name: string; line: string };
  pdfUrl: string;
}

function Slip({ title, aside, children }: { title: string; aside: string; children: React.ReactNode }) {
  return (
    <section className="hard-shadow border-2 border-ink bg-cream">
      <div className="eyebrow flex justify-between border-b-2 border-dashed border-ink/40 px-4 py-2.5 text-ink-2">
        <span>{title}</span>
        <span>{aside}</span>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 ${big ? "" : "border-b border-ink/20"}`}>
      <span className={big ? "font-display text-xl font-extrabold uppercase" : "eyebrow text-[0.65rem] text-ink-2"}>{label}</span>
      <span className={`text-right font-display font-extrabold tracking-tight ${big ? "text-3xl" : "text-xl"}`}>{value}</span>
    </div>
  );
}

/** Steps 3–4: the rate slip, totals by code, the WhatsApp message, status, and the quotation as it prints. */
export default function QuotationView({ q }: { q: QuotationViewData }) {
  const approved = q.status !== "Draft";
  const half = q.gstPercent / 2;
  const gstLines =
    q.gstMode === "intra"
      ? [
          { label: `CGST ${half}%`, paise: q.cgstPaise },
          { label: `SGST ${half}%`, paise: q.sgstPaise },
        ]
      : [{ label: `IGST ${q.gstPercent}%`, paise: q.igstPaise }];

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr]">
      <div className="flex flex-col gap-8">
        <CommandBox variant="rate" aside={`${q.quantity.toLocaleString("en-IN")} boxes`} />

        <section className="hard-shadow border-2 border-ink bg-kraft-2">
          <div className="eyebrow flex justify-between border-b-2 border-dashed border-ink/40 px-4 py-2.5 text-ink-2">
            <span>What is set</span>
            <span>Totals by code</span>
          </div>
          <div className="px-4 pb-3">
            <Row label="Rate per box" value={formatINR(q.ratePaise)} />
            <Row label={`Subtotal, ${q.quantity.toLocaleString("en-IN")} boxes`} value={formatINR(q.subtotalPaise)} />
            {gstLines.map((g) => (
              <Row key={g.label} label={g.label} value={formatINR(g.paise)} />
            ))}
            {q.roundOffPaise !== 0 && <Row label="Round off" value={formatINR(q.roundOffPaise)} />}
            <Row label="Delivery" value={q.terms.deliveryTime} />
            <Row label="Payment" value={q.terms.paymentTerms} />
            <Row label="Valid for" value={q.terms.validity} />
            <Row label="Total" value={formatINR(q.totalPaise)} big />
          </div>
        </section>

        <Slip title={`Message to ${q.company}`} aside="With the PDF">
          <div className="p-4">
            <div className="rounded-2xl border-2 border-ink bg-paper p-4">
              <a
                href={q.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-ink/60 bg-kraft-2 px-2 py-1 font-mono text-xs underline-offset-2 hover:underline"
              >
                ▤ Quotation-{(q.quoteNumber ?? "draft").replace(/[^\w-]+/g, "-")}.pdf
              </a>
              <p className="mt-3 text-[0.95rem] leading-relaxed">{q.message}</p>
            </div>
            <p className="mt-3 text-xs text-ink-2">Written from the card, so every message carries the customer&apos;s own name and spec.</p>
          </div>
        </Slip>
      </div>

      <div className="flex flex-col gap-8">
        <Slip title="Status" aside={approved ? "Step 4 of 4" : "Step 3 of 4"}>
          <div className="relative p-5">
            <span
              className={`absolute right-5 top-5 rotate-6 border-[3px] px-3 py-1 font-display text-lg font-extrabold uppercase tracking-[0.12em] ${
                approved ? "border-brick text-brick" : "border-ink text-ink"
              }`}
            >
              {q.status}
            </span>
            <h2 className="max-w-[15ch] font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-[0.005em]">
              {approved ? "Approved. Ready to send." : q.stillNeeded.length ? "Almost there." : "Check it, then approve."}
            </h2>
            <p className="mt-3 max-w-md text-ink-2">
              {approved
                ? `Quotation ${q.quoteNumber} is numbered and frozen. Sending on WhatsApp comes in phase 5; for now, download the PDF.`
                : q.stillNeeded.length
                  ? `Before approving, say: ${q.stillNeeded.join(", ")}.`
                  : "Nothing has been sent. Read the PDF and the message, then approve."}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {!approved && q.stillNeeded.length === 0 && (
                <>
                  <SayButton
                    text="approve"
                    className="hard-shadow border-2 border-ink bg-brick px-5 py-3 font-display text-lg font-extrabold uppercase tracking-[0.015em] text-cream"
                  >
                    Approve quotation
                  </SayButton>
                  <span className="text-sm text-ink-2">or say “approve”</span>
                </>
              )}
              <a
                href={`${q.pdfUrl}?download=1`}
                className="border-2 border-ink bg-paper px-4 py-3 font-display font-extrabold uppercase tracking-[0.015em]"
              >
                Download PDF
              </a>
            </div>
          </div>
        </Slip>

        {/* The quotation as it prints (the PDF is drawn from the same snapshot). */}
        <article className="hard-shadow relative overflow-hidden bg-paper p-6 text-ink md:p-8">
          {!approved && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] font-display text-8xl font-extrabold text-kraft-2/50"
            >
              DRAFT
            </span>
          )}
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-xl font-extrabold uppercase">{q.letterhead.name}</p>
              <p className="mt-1 font-mono text-[0.65rem] text-ink-2">{q.letterhead.line}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-extrabold uppercase text-brick">Quotation</p>
              <p className="mt-1 font-mono text-[0.65rem] text-ink-2">No. {q.quoteNumber ?? "DRAFT"}</p>
              <p className="font-mono text-[0.65rem] text-ink-2">{q.date}</p>
            </div>
          </div>
          <div className="relative mt-5 border-t-2 border-ink pt-4">
            <p className="eyebrow text-[0.6rem] text-ink-2">Quotation for</p>
            <p className="font-display text-lg font-extrabold uppercase">{q.company}</p>
            {q.customerLines.map((l) => (
              <p key={l} className="text-sm">
                {l}
              </p>
            ))}
          </div>
          <table className="relative mt-5 w-full table-fixed text-sm">
            <thead>
              <tr className="eyebrow border-y border-ink/40 text-[0.6rem] text-ink-2">
                <th className="w-1/2 py-1.5 text-left font-normal">Item</th>
                <th className="py-1.5 text-right font-normal">Qty</th>
                <th className="py-1.5 text-right font-normal">Rate</th>
                <th className="py-1.5 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink/20 align-top">
                <td className="py-3 pr-2">
                  <p className="font-semibold">{q.itemTitle}</p>
                  <p className="font-mono text-[0.65rem] text-ink-2">{q.itemDetail}</p>
                </td>
                <td className="py-3 text-right font-mono text-xs">{q.quantity.toLocaleString("en-IN")}</td>
                <td className="py-3 text-right font-mono text-xs">{formatINR(q.ratePaise)}</td>
                <td className="py-3 text-right font-mono text-xs">{formatINR(q.subtotalPaise)}</td>
              </tr>
            </tbody>
          </table>
          <dl className="relative ml-auto mt-4 w-full max-w-64 text-sm">
            <div className="flex justify-between py-1">
              <dt>Subtotal</dt>
              <dd className="font-mono text-xs">{formatINR(q.subtotalPaise)}</dd>
            </div>
            {gstLines.map((g) => (
              <div key={g.label} className="flex justify-between py-1">
                <dt>{g.label}</dt>
                <dd className="font-mono text-xs">{formatINR(g.paise)}</dd>
              </div>
            ))}
            {q.roundOffPaise !== 0 && (
              <div className="flex justify-between py-1">
                <dt>Round off</dt>
                <dd className="font-mono text-xs">{formatINR(q.roundOffPaise)}</dd>
              </div>
            )}
            <div className="mt-1 flex items-baseline justify-between border-t-2 border-ink pt-2">
              <dt className="font-display text-lg font-extrabold uppercase">Total</dt>
              <dd className="font-display text-2xl font-extrabold">{formatINR(q.totalPaise)}</dd>
            </div>
          </dl>
          <div className="relative mt-6 text-sm">
            <p className="eyebrow text-[0.6rem] text-ink-2">Terms</p>
            <p className="mt-1">Delivery: {q.terms.deliveryTime}</p>
            <p>Payment: {q.terms.paymentTerms}</p>
            <p>Valid for: {q.terms.validity}</p>
          </div>
          <p className="relative mt-10 w-48 border-t border-ink pt-1 font-mono text-[0.6rem] text-ink-2">Authorised signatory</p>
        </article>
      </div>
    </div>
  );
}
