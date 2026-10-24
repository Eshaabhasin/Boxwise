import QuotationView from "@/components/QuotationView";
import { computeTotals, formatINR } from "@/lib/calc/money";
import { COMPANY } from "@/lib/company";

/**
 * DESIGN PREVIEW of the final quotation screen, with the reference PDF's
 * sample numbers. Nothing here is saved. Totals are computed by the real code.
 * Delete this page once phase 4 builds the real /quote/<id> screen.
 */
export default async function QuotePreviewPage({ searchParams }: PageProps<"/design/quote">) {
  const params = await searchParams;
  const approved = params.status === "approved";
  const quantity = 500;
  const ratePaise = 1800;
  const gstPercent = 18;
  const totals = computeTotals({ quantity, ratePaise, gstPercent, mode: "intra" });

  return (
    <div className="flex flex-col gap-4">
      <p className="eyebrow mt-2 border-2 border-dashed border-brick px-3 py-2 text-brick">
        Design preview · sample quotation, not saved anywhere ·{" "}
        <a href={approved ? "/design/quote" : "/design/quote?status=approved"} className="underline">
          show {approved ? "draft" : "approved"} state
        </a>
      </p>
      <QuotationView
        q={{
          requestRef: "REQ-016",
          quoteNumber: "Q-0001",
          date: "24 Oct 2026",
          company: "Sharma Packaging",
          quantity,
          ratePaise,
          gstPercent,
          itemTitle: "Corrugated box, 5 ply",
          itemDetail: "12 × 10 × 8 in · 30 kg load · 2-colour print",
          totals,
          terms: { deliveryTime: "10 days", paymentTerms: "50% advance", validity: "[number] days" },
          message: `Namaste Sharma Packaging ji, aapki request (500 boxes, 12 × 10 × 8 inch, 5 ply, 30 kg load) ka quotation Q-0001 attached hai. Rate ${formatINR(ratePaise)} per box + ${gstPercent}% GST, total ${formatINR(totals.totalPaise)}. Delivery 10 din, payment 50% advance.\nDhanyavaad, ${COMPANY.name}`,
          status: approved ? "Approved" : "Draft",
          letterhead: { name: COMPANY.name, line: `${COMPANY.addressLines.join(", ")} · ${COMPANY.phone} · GST ${COMPANY.gstin || "[number]"}` },
        }}
      />
    </div>
  );
}
