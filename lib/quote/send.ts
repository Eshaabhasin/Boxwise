import "server-only";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { Quotation, Request } from "@/lib/models";
import { getCompany } from "@/lib/settings";

/**
 * Records that the owner sent an approved quotation: the quotation becomes
 * Sent and the card moves to Sent. Written to the card's history, so "undo"
 * can take it back. Sending again later is allowed and just updates the time.
 */
export async function markSent(quotationId: string, via: "share" | "link"): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Types.ObjectId.isValid(quotationId)) return { ok: false, error: "Unknown quotation" };
  await connectDb();
  const quote = await Quotation.findById(quotationId);
  if (!quote) return { ok: false, error: "Unknown quotation" };
  if (quote.status === "Draft") return { ok: false, error: "Approve the quotation before sending it." };

  const now = new Date();
  const firstTime = quote.status !== "Sent";
  quote.status = "Sent";
  quote.sentAt = now;
  if (!quote.seller) quote.seller = await getCompany();
  await quote.save();

  const request = await Request.findById(quote.requestId);
  if (request && firstTime) {
    const before = request.stage;
    if (before === "New" || before === "Quoted") request.stage = "Sent";
    request.history.push({
      planId: new Types.ObjectId(),
      action: "stage",
      quotationId: quote._id,
      summary: `Sent ${quote.number ?? "quotation"}${via === "link" ? " (text with PDF link)" : ""}`,
      stageBefore: before,
      stageAfter: request.stage,
      undone: false,
      at: now,
    });
    await request.save();
  }
  return { ok: true };
}
