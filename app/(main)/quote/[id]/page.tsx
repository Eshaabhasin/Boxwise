import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidObjectId } from "mongoose";
import CardDetail from "@/components/CardDetail";
import CommandBox from "@/components/CommandBox";
import Steps from "@/components/Steps";
import { waitingOn } from "@/lib/board";
import { entryAction } from "@/lib/commands/history";
import { requestRef } from "@/lib/commands/plan";
import { connectDb } from "@/lib/db";
import type { Specs } from "@/lib/fields";
import { Customer, Request } from "@/lib/models";

const ACTION_LABEL = { create: "Made", edit: "Changed", stage: "Moved", undo: "Undo" } as const;

// A request's journey: the saved card now, then rate, approve and send (phases 4–5).
export default async function QuotePage({ params }: PageProps<"/quote/[id]">) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();
  await connectDb();
  const request = await Request.findOne({ _id: id, deletedAt: null }).lean();
  if (!request) notFound();
  const customer = await Customer.findById(request.customerId).lean();

  const specs: Specs = {
    ...request.specs,
    company: customer?.company ?? request.customerName,
    contactPerson: customer?.contactPerson,
    phone: customer?.phone,
    gstin: customer?.gstin,
    address: customer?.address,
  };
  const ref = requestRef(request.number);
  const waiting = waitingOn(request.stage, request.missing.length, false);
  const history = request.history
    .map((h, i) => ({ ...h, action: entryAction(h, i) }))
    .reverse();

  return (
    <div className="flex flex-col gap-8 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-ink-2">
            {ref} · {request.stage}
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

      <Steps current={2} />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-6">
          <CommandBox variant="rate" aside={request.specs.quantity ? `${request.specs.quantity} boxes` : undefined} />
          <div className="text-sm leading-relaxed text-ink-2">
            <p>
              Try: “height 9 inch kar do”, “address Bhiwandi godown”, “order mil gaya”, or “undo”. Saying the rate and
              terms comes in phase 4.
            </p>
          </div>

          {history.length > 0 && (
            <section className="border-2 border-ink/60 bg-cream/60">
              <p className="eyebrow border-b-2 border-dashed border-ink/30 px-4 py-2.5 text-ink-2">Changes</p>
              <ol className="divide-y divide-ink/15 px-4">
                {history.map((h) => (
                  <li key={h.planId.toString()} className={`py-2.5 text-sm ${h.undone && h.action !== "undo" ? "text-ink-2/60 line-through" : ""}`}>
                    <span className="eyebrow mr-2 text-[0.6rem] text-ink-2">{ACTION_LABEL[h.action]}</span>
                    {h.summary}
                    <span className="ml-2 font-mono text-[0.65rem] text-ink-2">
                      {new Date(h.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
        <CardDetail specs={specs} missing={request.missing} rawTexts={request.rawTexts.map((r) => r.text)} />
      </div>
    </div>
  );
}
