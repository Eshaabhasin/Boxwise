import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isValidObjectId } from "mongoose";
import CardDetail from "@/components/CardDetail";
import CommandBox from "@/components/CommandBox";
import QuotationView, { type QuotationViewData } from "@/components/QuotationView";
import Steps from "@/components/Steps";
import { waitingOn } from "@/lib/board";
import { mergedSpecs } from "@/lib/commands/cards";
import { entryAction } from "@/lib/commands/history";
import { requestRef } from "@/lib/commands/plan";
import { COMPANY } from "@/lib/company";
import { connectDb } from "@/lib/db";
import { getField } from "@/lib/fields";
import { Customer, Quotation, Request } from "@/lib/models";
import { QUOTE_FIELDS, missingFor, whatsappMessage } from "@/lib/quote/build";
import { pdfFileName, publicPdfUrl } from "@/lib/quote/share";

/** Where the customer can open the PDF: PUBLIC_BASE_URL, or the address this page was opened on. */
async function baseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL && !process.env.PUBLIC_BASE_URL.includes("localhost")) return process.env.PUBLIC_BASE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const ACTION_LABEL = { create: "Made", edit: "Changed", stage: "Moved", quote: "Approved", undo: "Undo" } as const;

// A request's journey: the card (step 2), then the draft (3) and the approved quotation (4).
export default async function QuotePage({ params }: PageProps<"/quote/[id]">) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();
  await connectDb();
  const request = await Request.findOne({ _id: id, deletedAt: null }).lean();
  if (!request) notFound();
  const [customer, quote] = await Promise.all([
    Customer.findById(request.customerId).lean(),
    Quotation.findOne({ requestId: request._id }).sort({ createdAt: -1 }).lean(),
  ]);

  const specs = mergedSpecs(request, customer);
  const ref = requestRef(request.number);
  const waiting = waitingOn(request.stage, request.missing.length, quote?.status === "Draft");
  const history = request.history.map((h, i) => ({ ...h, action: entryAction(h, i) })).reverse();
  const step = !quote ? 2 : quote.status === "Draft" ? 3 : 4;

  let view: QuotationViewData | null = null;
  if (quote) {
    const c = quote.customerSnapshot;
    view = {
      quoteNumber: quote.number,
      date: (quote.approvedAt ?? quote.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }),
      company: c.company,
      customerLines: [c.contactPerson ? `Attn: ${c.contactPerson}` : "", c.address ?? "", c.gstin ? `GSTIN ${c.gstin}` : ""].filter(Boolean),
      quantity: quote.quantity,
      ratePaise: quote.ratePaise,
      gstPercent: quote.gstPercent,
      gstMode: quote.gstMode,
      itemTitle: quote.itemTitle,
      itemDetail: quote.itemDetail,
      subtotalPaise: quote.subtotalPaise,
      cgstPaise: quote.cgstPaise,
      sgstPaise: quote.sgstPaise,
      igstPaise: quote.igstPaise,
      roundOffPaise: quote.roundOffPaise,
      totalPaise: quote.totalPaise,
      terms: quote.terms,
      message: whatsappMessage(
        {
          customerSnapshot: c,
          specsSnapshot: quote.specsSnapshot,
          quantity: quote.quantity,
          ratePaise: quote.ratePaise,
          gstPercent: quote.gstPercent,
          terms: quote.terms,
          totalPaise: quote.totalPaise,
        },
        quote.number ?? "(number on approval)",
        COMPANY.name,
      ),
      status: quote.status,
      stillNeeded: quote.status === "Draft" ? missingFor(specs, QUOTE_FIELDS).map((k) => getField(k)?.label ?? k) : [],
      letterhead: {
        name: COMPANY.name,
        line: [COMPANY.addressLines.join(", "), COMPANY.phone, COMPANY.gstin ? `GSTIN ${COMPANY.gstin}` : ""].filter(Boolean).join(" · "),
      },
      pdfUrl: `/api/quotations/${quote._id.toString()}/pdf`,
      share: {
        quotationId: quote._id.toString(),
        fileName: pdfFileName(quote.number),
        publicPdfUrl: publicPdfUrl(await baseUrl(), quote.shareToken),
        phone: c.phone,
        sentOn: quote.sentAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }),
      },
    };
  }

  const changes = history.length > 0 && (
    <section className="border-2 border-ink/60 bg-cream/60">
      <p className="eyebrow border-b-2 border-dashed border-ink/30 px-4 py-2.5 text-ink-2">Changes</p>
      <ol className="divide-y divide-ink/15 px-4">
        {history.map((h) => (
          <li key={h.planId.toString()} className={`py-2.5 text-sm ${h.undone && h.action !== "undo" ? "text-ink-2/60 line-through" : ""}`}>
            <span className="eyebrow mr-2 text-[0.6rem] text-ink-2">{ACTION_LABEL[h.action]}</span>
            {h.summary}
            <span className="ml-2 font-mono text-[0.65rem] text-ink-2">
              {new Date(h.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
  const card = <CardDetail specs={specs} missing={request.missing} rawTexts={request.rawTexts.map((r) => r.text)} />;

  return (
    <div className="flex flex-col gap-8 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-ink-2">
            {ref} · {request.stage}
            {quote?.number && <> · Quotation {quote.number}</>}
            {waiting && <> · waiting on {waiting.toLowerCase()}</>}
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.035em] md:text-6xl">
            Quotation for {request.customerName}
          </h1>
        </div>
        <Link href="/board" className="text-sm font-medium text-ink-2 underline">
          Back to board
        </Link>
      </div>

      <Steps current={step} />

      {view ? (
        <>
          <QuotationView q={view} />
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div>{changes}</div>
            {card}
          </div>
        </>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-6">
            <CommandBox variant="rate" aside={request.specs.quantity ? `${request.specs.quantity} boxes` : undefined} />
            <p className="text-sm leading-relaxed text-ink-2">
              Say your rate and terms, e.g. “rate 18 rupees per box, GST 18 percent, delivery 10 days, payment 50 percent
              advance, validity 15 din”. Changes work too: “height 9 inch kar do”, “order mil gaya”, “undo”.
            </p>
            {changes}
          </div>
          {card}
        </div>
      )}
    </div>
  );
}
