import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isValidObjectId } from "mongoose";
import CommandBox from "@/components/CommandBox";
import EnquiryDetail from "@/components/EnquiryDetail";
import QuotationEditor, { type EditorQuote } from "@/components/QuotationEditor";
import SayButton from "@/components/SayButton";
import ShareButton from "@/components/ShareButton";
import StatusBadge from "@/components/StatusBadge";
import Steps from "@/components/Steps";
import { waitingOn } from "@/lib/board";
import { boxLabel, requestRef } from "@/lib/card";
import { cardState } from "@/lib/commands/cards";
import { WORKING } from "@/lib/commands/plan-sections";
import { entryAction } from "@/lib/commands/history";
import { formatINR } from "@/lib/calc/money";
import { connectDb } from "@/lib/db";
import { Customer, Quotation, Request } from "@/lib/models";
import { quoteGaps, whatsappMessage } from "@/lib/quote/build";
import { pdfFileName, publicPdfUrl } from "@/lib/quote/share";
import { slab } from "@/lib/fonts";
import { priceBox } from "@/lib/pricing/formula";
import { getCompany, getPricing } from "@/lib/settings";

const ACTION_LABEL = { create: "Made", edit: "Changed", stage: "Moved", quote: "Approved", undo: "Undo" } as const;

/** Where the customer can open the PDF: PUBLIC_BASE_URL, or the address this page was opened on. */
async function baseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL && !process.env.PUBLIC_BASE_URL.includes("localhost")) return process.env.PUBLIC_BASE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function day(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

// One enquiry: its boxes, then the quotation (editable) with approve and send.
export default async function QuotePage({ params }: PageProps<"/quote/[id]">) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();
  await connectDb();
  const request = await Request.findOne({ _id: id, deletedAt: null }).lean();
  if (!request) notFound();
  const [customer, quote, company, rates] = await Promise.all([
    Customer.findById(request.customerId).lean(),
    Quotation.findOne({ requestId: request._id }).sort({ createdAt: -1 }).lean(),
    getCompany(),
    getPricing(),
  ]);

  const state = cardState(request, customer);
  const gaps = quoteGaps(state);
  const ref = requestRef(request.number);
  const waiting = waitingOn(request.stage, request.missing.length, quote?.status === "Draft");
  const history = request.history.map((h, i) => ({ ...h, action: entryAction(h, i) })).reverse();
  const step = !quote ? (gaps.forDraft.length > 0 && request.missing.length > 0 ? 1 : 2) : quote.status === "Draft" ? 3 : quote.status === "Sent" ? 5 : 4;

  let editor: EditorQuote | null = null;
  let message = "";
  if (quote) {
    const c = quote.customerSnapshot;
    editor = {
      id: quote._id.toString(),
      number: quote.number,
      status: quote.status,
      date: day(quote.approvedAt ?? quote.createdAt),
      edit: {
        customer: { company: c.company, contactPerson: c.contactPerson ?? "", phone: c.phone ?? "", gstin: c.gstin ?? "", address: c.address ?? "" },
        lines: quote.lines.map((l) => ({ itemId: l.itemId, title: l.title, detail: l.detail, quantity: l.quantity, rate: l.ratePaise / 100 })),
        terms: { gstPercent: quote.gstPercent, deliveryTime: quote.terms.deliveryTime, paymentTerms: quote.terms.paymentTerms, validity: quote.terms.validity },
        notes: quote.notes ?? "",
      },
      amounts: quote.lines.map((l) => l.amountPaise),
      subtotalPaise: quote.subtotalPaise,
      gstMode: quote.gstMode,
      cgstPaise: quote.cgstPaise,
      sgstPaise: quote.sgstPaise,
      igstPaise: quote.igstPaise,
      roundOffPaise: quote.roundOffPaise,
      totalPaise: quote.totalPaise,
      letterhead: quote.seller ?? company,
      letterheadFrozen: quote.status === "Sent" && Boolean(quote.seller),
    };
    message = whatsappMessage({ ...quote, totalPaise: quote.totalPaise }, quote.number ?? "(number on approval)", (quote.seller ?? company).name);
  }
  const pdfUrl = quote ? `/api/quotations/${quote._id.toString()}/pdf` : "";

  // For him only: this sits beside the quotation, never on it, the PDF or the message.
  const working = state.boxes.flatMap((b, i) => {
    const r = priceBox(b.specs, rates);
    if (!r.ok) return [];
    const own = typeof b.specs.ratePerBox === "number" && b.specs.ratePerBox !== r.ratePaise ? [`Quoted at your rate: ${formatINR(b.specs.ratePerBox)}`] : [];
    return [{ label: boxLabel(i), steps: [...r.steps, ...own] }];
  });

  const changes = history.length > 0 && (
    <details className="panel p-4 text-sm">
      <summary className="cursor-pointer font-medium text-ink-2">Changes ({history.length}) · say “undo” to take back the last one</summary>
      <ol className="mt-2 divide-y divide-line">
        {history.map((h) => (
          <li key={h.planId.toString()} className={`py-2 ${h.undone && h.action !== "undo" ? "text-ink-3 line-through" : ""}`}>
            <span className="mr-2 text-xs font-semibold uppercase text-ink-3">{ACTION_LABEL[h.action]}</span>
            {h.summary.replace(" on WhatsApp", "").split("; ").filter((part) => !WORKING.test(part)).join("; ")}
            <span className="ml-2 text-xs text-ink-3">
              {new Date(h.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );

  return (
    <div className="kraft-page flex flex-col gap-6 pt-8">
      <div aria-hidden="true" className="kraft-sheet pointer-events-none fixed inset-0 -z-10" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <Link href="/board" className="hover:text-ink">
              Enquiries
            </Link>
            <span>/</span>
            <span>{ref}</span>
            <StatusBadge stage={request.stage} />
            {waiting && <span>Waiting on {waiting.toLowerCase()}</span>}
          </p>
          <h1 className={`${slab.className} mt-1 text-5xl leading-none tracking-[-0.02em] text-[#3a2412] md:text-6xl`}>{request.customerName}</h1>
          <p className="mt-2 font-medium text-[#3a2412]">
            {state.boxes.length} {state.boxes.length === 1 ? "box" : "boxes"}
            {quote?.number && <> · Quotation {quote.number}</>}
          </p>
        </div>
        <Steps current={step} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <CommandBox variant="rate" aside={`${state.boxes.length} ${state.boxes.length === 1 ? "box" : "boxes"}`} />

          {quote ? (
            <section className="panel p-4">
              <p className="label-xs">Quotation</p>
              <p className="mt-1 text-sm text-ink-2">
                {quote.status === "Sent"
                  ? `Sent ${quote.sentAt ? day(quote.sentAt) : ""}. Waiting for the reply: say “order mil gaya” or “mana kar diya”.`
                  : quote.status === "Approved"
                    ? "Approved and numbered. Nothing leaves until you send it."
                    : gaps.forApproval.length > 0
                      ? `Before approving, say or type: ${gaps.forApproval.join(", ")}.`
                      : "Check the quotation, then approve. Nothing is sent yet."}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {quote.status === "Draft" && gaps.forApproval.length === 0 && (
                  <SayButton text="approve" className="btn btn-primary w-full">
                    Approve quotation
                  </SayButton>
                )}
                {quote.status !== "Draft" && (
                  <ShareButton
                    quotationId={quote._id.toString()}
                    fileName={pdfFileName(quote.number)}
                    pdfUrl={pdfUrl}
                    publicPdfUrl={publicPdfUrl(await baseUrl(), quote.shareToken)}
                    message={message}
                    phone={quote.customerSnapshot.phone}
                    sent={quote.status === "Sent"}
                  />
                )}
                <a href={`${pdfUrl}?download=1`} className="btn btn-quiet w-full">
                  Download PDF
                </a>
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-3">Message</summary>
                <p className="mt-2 rounded-lg bg-sunk p-3 text-ink-2">{message}</p>
              </details>
            </section>
          ) : (
            <section className="panel p-4 text-sm text-ink-2">
              <p className="label-xs">Next</p>
              <p className="mt-1">
                {gaps.forDraft.length > 0 ? `For the quotation, say: ${gaps.forDraft.join("; ")}.` : "Everything is there; the quotation is being prepared."}
              </p>
              <p className="mt-2 text-ink-3">e.g. “pehle box ka rate 18, doosre ka 22, GST 18 percent, delivery 10 days, payment 50 percent advance, validity 15 din”.</p>
            </section>
          )}
          {working.length > 0 && (
            <details className="panel p-4 text-sm">
              <summary className="cursor-pointer font-medium text-ink-2">How the rate was worked out</summary>
              <div className="mt-3 flex flex-col gap-4">
                {working.map((w) => (
                  <div key={w.label}>
                    {working.length > 1 && <p className="mb-1 font-medium">{w.label}</p>}
                    <ul className="flex flex-col gap-1 text-ink-2">
                      {w.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}
          {changes}
        </div>

        {editor ? (
          <QuotationEditor q={editor} version={`${editor.id}-${quote?.updatedAt.getTime() ?? 0}`} />
        ) : (
          <EnquiryDetail customer={state.customer} boxes={request.items ?? []} terms={state.terms} missing={request.missing} rawTexts={request.rawTexts.map((r) => r.text)} />
        )}
      </div>

      {editor && (
        <section>
          <h2 className={`${slab.className} mb-3 text-2xl text-[#3a2412]`}>The enquiry</h2>
          <EnquiryDetail customer={state.customer} boxes={request.items ?? []} terms={state.terms} missing={request.missing} rawTexts={request.rawTexts.map((r) => r.text)} />
        </section>
      )}
    </div>
  );
}
