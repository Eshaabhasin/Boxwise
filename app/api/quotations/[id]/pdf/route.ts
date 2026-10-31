import { isValidObjectId } from "mongoose";
import { connectDb } from "@/lib/db";
import { Quotation } from "@/lib/models";
import { pdfFileName, renderQuotationPdf } from "@/lib/pdf/QuotationPdf";
import { getCompany } from "@/lib/settings";

// The quotation PDF, rebuilt from its frozen snapshot. ?download=1 saves instead of opening.
export async function GET(request: Request, { params }: RouteContext<"/api/quotations/[id]/pdf">) {
  const { id } = await params;
  if (!isValidObjectId(id)) return new Response("Not found", { status: 404 });
  await connectDb();
  const q = await Quotation.findById(id).lean();
  if (!q) return new Response("Not found", { status: 404 });

  const pdf = await renderQuotationPdf({ ...q, date: q.approvedAt ?? q.createdAt }, q.seller ?? (await getCompany()));
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdfFileName(q.number)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
