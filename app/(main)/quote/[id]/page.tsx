import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidObjectId } from "mongoose";
import CardDetail from "@/components/CardDetail";
import CommandBox from "@/components/CommandBox";
import Steps from "@/components/Steps";
import { waitingOn } from "@/lib/board";
import { connectDb } from "@/lib/db";
import type { Specs } from "@/lib/fields";
import { Customer, Request } from "@/lib/models";

// A request's journey: the saved card now, then rate, approve and send (phases 4–5).
export default async function QuotePage({ params }: PageProps<"/quote/[id]">) {
  const { id } = await params;
  if (!isValidObjectId(id)) notFound();
  await connectDb();
  const request = await Request.findById(id).lean();
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
  const ref = request.number ? `REQ-${String(request.number).padStart(3, "0")}` : "REQ";
  const waiting = waitingOn(request.stage, request.missing.length, false);

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
        <div className="flex flex-col gap-4">
          <CommandBox variant="rate" aside={request.specs.quantity ? `${request.specs.quantity} boxes` : undefined} />
          <p className="text-sm text-ink-2">
            Saying the rate and terms comes in phase 4. Until then you can dictate a new request from{" "}
            <Link href="/quote/new" className="underline">
              Start a quote
            </Link>
            .
          </p>
        </div>
        <CardDetail specs={specs} missing={request.missing} rawTexts={request.rawTexts.map((r) => r.text)} />
      </div>
    </div>
  );
}
