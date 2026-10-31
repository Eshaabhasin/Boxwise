import { connectDb } from "@/lib/db";
import { Quotation } from "@/lib/models";
import { pdfFileName, renderQuotationPdf } from "@/lib/pdf/QuotationPdf";
import { getCompany } from "@/lib/settings";

// Public link to an approved quotation's PDF, for the WhatsApp text fallback.
// The token is long and random; drafts are never served here.
export async function GET(_request: Request, { params }: RouteContext<"/q/[token]">) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) return new Response("Not found", { status: 404 });
  await connectDb();
  const q = await Quotation.findOne({ shareToken: token, status: { $in: ["Approved", "Sent"] } }).lean();
  if (!q) return new Response("Not found", { status: 404 });

  const pdf = await renderQuotationPdf({ ...q, date: q.approvedAt ?? q.createdAt }, q.seller ?? (await getCompany()));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(q.number)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
