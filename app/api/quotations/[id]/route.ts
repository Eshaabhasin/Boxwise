import { NextResponse } from "next/server";
import { Types, isValidObjectId } from "mongoose";
import { companyKey, newBoxId } from "@/lib/card";
import { commitCardChange } from "@/lib/commands/apply";
import { loadCard } from "@/lib/commands/cards";
import { diffLines } from "@/lib/commands/plan";
import { stateCodeOf } from "@/lib/company";
import { getCompany, getPricing } from "@/lib/settings";
import { repriceTyped } from "@/lib/pricing/apply";
import { connectDb } from "@/lib/db";
import { Customer, Quotation, Request } from "@/lib/models";
import { buildQuote, itemDetail, itemTitle } from "@/lib/quote/build";
import { fillQuotation, syncQuotation, workingQuotation } from "@/lib/quote/drafts";
import { QuotationEdit, applyQuotationEdit, describeTypedEdit } from "@/lib/quote/edit";

/**
 * Saves edits typed on the quotation. Card values go back to the card (with
 * undo); wording stays on the quotation; totals are worked out again by code.
 * A sent quotation is never changed: editing it starts a revision.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/quotations/[id]">) {
  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Unknown quotation" }, { status: 404 });
  const parsed = QuotationEdit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: `${first?.path.join(".") ?? ""} ${first?.message ?? "Invalid edit"}`.trim() }, { status: 400 });
  }
  await connectDb();
  const quote = await Quotation.findById(id);
  if (!quote) return NextResponse.json({ error: "Unknown quotation" }, { status: 404 });
  const loaded = await loadCard(quote.requestId.toString());
  if (!loaded) return NextResponse.json({ error: "That card no longer exists." }, { status: 404 });

  const typed = applyQuotationEdit(loaded.state, parsed.data, (s) => ({ title: itemTitle(s), detail: itemDetail(s) }), newBoxId);
  // A typed rate or charge is his from now on; a typed quantity reprices the rest by the formula.
  const edit = { ...typed, after: repriceTyped(loaded.state, typed.after, await getPricing()) };
  const lines = diffLines(loaded.state, edit.after);
  const wordingChanged = JSON.stringify(edit.lineText) !== JSON.stringify(quote.lineText ?? {}) || edit.notes !== (quote.notes ?? "");
  if (lines.length === 0 && !wordingChanged && !edit.rename) return NextResponse.json({ ok: true, message: "No changes.", quotationId: id });

  if (edit.rename) {
    // Renaming the customer, typed on purpose: the customer record and their cards follow.
    const key = companyKey(edit.rename);
    const taken = await Customer.findOne({ companyKey: key, _id: { $ne: loaded.request.customerId } });
    if (taken) return NextResponse.json({ error: `A customer called ${taken.company} already exists.` }, { status: 400 });
    if (loaded.customer) {
      loaded.customer.company = edit.rename;
      loaded.customer.companyKey = key;
    }
    loaded.request.customerName = edit.rename;
    loaded.request.customerKey = key;
    await Request.updateMany({ customerId: loaded.request.customerId, _id: { $ne: loaded.request._id } }, { customerName: edit.rename, customerKey: key });
  }

  // One history entry (so "undo" works), then the quotation brought in line with the card.
  const summary = describeTypedEdit(edit.rename ? [`Company: ${edit.rename}`, ...lines] : lines, wordingChanged);
  let message = await commitCardChange(loaded, edit.after, { planId: new Types.ObjectId(), summary, makeQuote: true });

  // Wording lives on the quotation: put it on the working one (a new revision if the last was sent) and rebuild.
  const working = (await workingQuotation(loaded.request._id)) ?? (await syncQuotation(loaded.request, edit.after)).quote;
  if (working && wordingChanged) {
    working.lineText = edit.lineText;
    working.notes = edit.notes;
    working.markModified("lineText");
    fillQuotation(working, buildQuote(edit.after, stateCodeOf(await getCompany()), edit.lineText));
    await working.save();
    if (lines.length === 0) message = working.revision > quote.revision ? "New revision with your wording. Approve it before sending." : "Saved.";
  }
  return NextResponse.json({ ok: true, message, quotationId: (working ?? quote)._id.toString() });
}
