import "server-only";
import { buildCardView, searchTerms, stagesFor, type BoardFilter, type BoxCardView } from "@/lib/board";
import { connectDb } from "@/lib/db";
import { STAGES, type Stage } from "@/lib/fields";
import { Quotation, Request } from "@/lib/models";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cards removed by "undo" stay in the database but never show. Search finds a REQ number or part of a company name. */
function companyFilter(q: string) {
  const live = { deletedAt: null };
  const { number, company } = searchTerms(q);
  if (number !== undefined) return { ...live, number };
  return company ? { ...live, customerName: { $regex: escapeRegex(company), $options: "i" } } : live;
}

export async function getStageCounts(q = ""): Promise<Record<Stage, number>> {
  await connectDb();
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  const grouped = await Request.aggregate<{ _id: Stage; n: number }>([
    { $match: companyFilter(q) },
    { $group: { _id: "$stage", n: { $sum: 1 } } },
  ]);
  for (const g of grouped) counts[g._id] = g.n;
  return counts;
}

export async function getBoardCards(filter: BoardFilter, q = ""): Promise<BoxCardView[]> {
  await connectDb();
  const docs = await Request.find({ ...companyFilter(q), stage: { $in: stagesFor(filter) } })
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();
  // Cards with a draft quotation are waiting on the owner's approval.
  const drafts = await Quotation.distinct("requestId", { status: "Draft", requestId: { $in: docs.map((d) => d._id) } });
  const hasDraft = new Set(drafts.map((d) => String(d)));
  return docs.map((d) =>
    buildCardView({
      id: d._id.toString(),
      number: d.number,
      customerName: d.customerName,
      stage: d.stage,
      boxes: d.items ?? [],
      missing: d.missing,
      hasDraftQuote: hasDraft.has(d._id.toString()),
    }),
  );
}
