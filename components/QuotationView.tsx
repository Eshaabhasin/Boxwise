import CommandBox from "@/components/CommandBox";
import Steps from "@/components/Steps";
import { formatINR, type Totals } from "@/lib/calc/money";

export interface QuotationViewData {
  requestRef: string;
  quoteNumber: string;
  date: string;
  company: string;
  quantity: number;
  ratePaise: number;
  gstPercent: number;
  itemTitle: string;
  itemDetail: string;
  totals: Totals;
  terms: { deliveryTime: string; paymentTerms: string; validity: string };
  message: string;
  status: "Draft" | "Approved";
  letterhead: { name: string; line: string };
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
      <span className={big ? "font-display text-xl font-extrabold uppercase" : "eyebrow text-[0.65rem] text-ink-2"}>
        {label}
      </span>
      <span className={`font-display font-extrabold tracking-tight ${big ? "text-3xl" : "text-xl"}`}>{value}</span>
    </div>
  );
}

/** Steps 2–4: rate slip, totals by code, the PDF, and the WhatsApp message. */
export default function QuotationView({ q }: { q: QuotationViewData }) {
  const t = q.totals;
  const approved = q.status === "Approved";
  return (
    <div className="flex flex-col gap-8 pt-4">
      <div>
        <p className="eyebrow text-ink-2">
          {q.requestRef} · Quotation {q.quoteNumber}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.035em] md:text-6xl">
          Quotation for {q.company}
        </h1>
      </div>

      <Steps current={approved ? 4 : 3} />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col gap-8">
          <CommandBox variant="rate" aside={`${q.quantity.toLocaleString("en-IN")} boxes`} />

          <section className="hard-shadow border-2 border-ink bg-kraft-2">
            <div className="eyebrow flex justify-between border-b-2 border-dashed border-ink/40 px-4 py-2.5 text-ink-2">
              <span>What I will set</span>
              <span>Totals by code</span>
            </div>
            <div className="px-4 pb-3">
              <Row label="Rate per box" value={formatINR(q.ratePaise)} />
              <Row label={`Subtotal, ${q.quantity.toLocaleString("en-IN")} boxes`} value={formatINR(t.subtotalPaise)} />
              <Row label={`GST ${q.gstPercent}%`} value={formatINR(t.gstPaise)} />
              <Row label="Delivery" value={q.terms.deliveryTime} />
              <Row label="Payment" value={q.terms.paymentTerms} />
              <Row label="Total" value={formatINR(t.totalPaise)} big />
            </div>
          </section>

          <Slip title={`Message to ${q.company}`} aside="With the PDF">
            <div className="p-4">
              <div className="rounded-2xl border-2 border-ink bg-paper p-4">
                <span className="inline-flex items-center gap-2 border border-ink/60 bg-kraft-2 px-2 py-1 font-mono text-xs">
                  ▤ Quotation-{q.quoteNumber}.pdf
                </span>
                <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-relaxed">{q.message}</p>
              </div>
              <p className="mt-3 text-xs text-ink-2">
                Written from the card, so every message carries the customer&apos;s own name and spec.
              </p>
            </div>
          </Slip>
        </div>

        <div className="flex flex-col gap-8">
          <Slip title="Status" aside={approved ? "Step 4 of 4" : "Step 3 of 4"}>
            <div className="relative p-5">
              <span className="absolute right-5 top-5 rotate-6 border-[3px] border-ink px-3 py-1 font-display text-lg font-extrabold uppercase tracking-[0.12em] text-ink">
                {approved ? "Approved" : "Draft"}
              </span>
              <h2 className="max-w-[16ch] font-display text-3xl font-extrabold uppercase leading-[0.95] tracking-[0.005em]">
                {approved ? "Approved. Ready to send." : "Check it, then approve."}
              </h2>
              <p className="mt-3 max-w-md text-ink-2">
                {approved
                  ? `The PDF and message go to ${q.company} on WhatsApp. Nothing leaves until you press send.`
                  : "Nothing has been sent yet. Read the PDF and the message, then approve."}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="hard-shadow border-2 border-ink bg-brick px-5 py-3 font-display text-lg font-extrabold uppercase tracking-[0.015em] text-cream"
                >
                  {approved ? "Send on WhatsApp" : "Approve quotation"}
                </button>
                <span className="text-sm text-ink-2">or say “{approved ? "send" : "approve"}”</span>
              </div>
            </div>
          </Slip>

          {/* The quotation as it will look on the PDF. */}
          <article className="hard-shadow bg-paper p-6 text-ink md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-xl font-extrabold uppercase">{q.letterhead.name}</p>
                <p className="mt-1 font-mono text-[0.65rem] text-ink-2">{q.letterhead.line}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-extrabold uppercase text-brick">Quotation</p>
                <p className="mt-1 font-mono text-[0.65rem] text-ink-2">No. {q.quoteNumber}</p>
                <p className="font-mono text-[0.65rem] text-ink-2">{q.date}</p>
              </div>
            </div>
            <div className="mt-5 border-t-2 border-ink pt-4">
              <p className="eyebrow text-[0.6rem] text-ink-2">Quotation for</p>
              <p className="font-display text-lg font-extrabold uppercase">{q.company}</p>
            </div>
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="eyebrow border-y border-ink/40 text-[0.6rem] text-ink-2">
                  <th className="py-1.5 text-left font-normal">Item</th>
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
                  <td className="py-3 text-right font-mono text-xs">{q.quantity}</td>
                  <td className="py-3 text-right font-mono text-xs">{formatINR(q.ratePaise)}</td>
                  <td className="py-3 text-right font-mono text-xs">{formatINR(t.subtotalPaise)}</td>
                </tr>
              </tbody>
            </table>
            <dl className="ml-auto mt-4 w-full max-w-60 text-sm">
              <div className="flex justify-between py-1">
                <dt>Subtotal</dt>
                <dd className="font-mono text-xs">{formatINR(t.subtotalPaise)}</dd>
              </div>
              <div className="flex justify-between border-b-2 border-ink py-1">
                <dt>GST {q.gstPercent}%</dt>
                <dd className="font-mono text-xs">{formatINR(t.gstPaise)}</dd>
              </div>
              <div className="flex items-baseline justify-between pt-2">
                <dt className="font-display text-lg font-extrabold uppercase">Total</dt>
                <dd className="font-display text-2xl font-extrabold">{formatINR(t.totalPaise)}</dd>
              </div>
            </dl>
            <div className="mt-6 text-sm">
              <p className="eyebrow text-[0.6rem] text-ink-2">Terms</p>
              <p className="mt-1">Delivery: {q.terms.deliveryTime}</p>
              <p>Payment: {q.terms.paymentTerms}</p>
              <p>Valid for: {q.terms.validity}</p>
            </div>
            <p className="mt-10 w-48 border-t border-ink pt-1 font-mono text-[0.6rem] text-ink-2">Authorised signatory</p>
          </article>
        </div>
      </div>
    </div>
  );
}
