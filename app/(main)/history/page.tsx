import Link from "next/link";
import { Suspense } from "react";
import SearchBox from "@/components/SearchBox";
import StatusBadge from "@/components/StatusBadge";
import { searchTerms } from "@/lib/board";
import { formatINR } from "@/lib/calc/money";
import { connectDb } from "@/lib/db";
import { Quotation } from "@/lib/models";
import { slab } from "@/lib/fonts";
import { lineOwner } from "@/lib/quote/build";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function day(d: Date | undefined): string {
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
}

interface Row {
  id: string;
  requestId: string;
  number: string;
  company: string;
  date: string;
  sentOn: string | null;
  status: "Approved" | "Sent";
  boxes: number;
  pieces: number;
  totalPaise: number;
}

// Every approved and sent quotation, newest first, re-downloadable.
export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  let error = "";
  let rows: Row[] = [];
  try {
    await connectDb();
    // Search finds part of a company name or of a quotation number ("Gupta", "0003").
    const words = searchTerms(q).company ?? (q ? q : "");
    const match = words ? { $regex: escapeRegex(words), $options: "i" } : null;
    const filter = {
      status: { $in: ["Approved", "Sent"] as ("Approved" | "Sent")[] },
      ...(match ? { $or: [{ "customerSnapshot.company": match }, { number: match }] } : {}),
    };
    const docs = await Quotation.find(filter).sort({ approvedAt: -1 }).limit(300).lean();
    rows = docs.map((d) => {
      // Die and design charges are lines too, but not boxes.
      const boxLines = d.lines.filter((l) => lineOwner(l.itemId).charge === null);
      return {
      id: d._id.toString(),
      requestId: d.requestId.toString(),
      number: d.number ?? "—",
      company: d.customerSnapshot.company,
      date: day(d.approvedAt ?? d.createdAt),
      sentOn: d.sentAt ? day(d.sentAt) : null,
      status: d.status === "Sent" ? "Sent" : "Approved",
      boxes: boxLines.length,
      pieces: boxLines.reduce((n, l) => n + l.quantity, 0),
      totalPaise: d.totalPaise,
    };
    });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex flex-col gap-6 pt-8">
      <div aria-hidden="true" className="kraft-sheet pointer-events-none fixed inset-0 -z-10" />

      <div>
        <h1 className={`${slab.className} text-5xl leading-none tracking-[-0.02em] text-[#3a2412] md:text-6xl`}>Quotations</h1>
        <p className="mt-2 font-medium text-[#3a2412]">
          {rows.length} approved or sent{q ? ` · matching “${q}”` : ""}
        </p>
      </div>

      <Suspense>
        <SearchBox initial={q} label="Search quotations by company or number" kraft />
      </Suspense>

      {error ? (
        <p className="glass p-4 text-sm text-bad">Can&apos;t load quotations: {error}</p>
      ) : rows.length === 0 ? (
        <div className="glass p-10 text-center">
          <p className={`${slab.className} text-2xl text-[#3a2412]`}>{q ? "No quotations match" : "No quotations yet"}</p>
          <p className="mt-1 text-sm text-ink-2">{q ? "Try part of the company name, or the number like 0003." : "Approved and sent quotations appear here, with their PDFs."}</p>
        </div>
      ) : (
        <div className="glass overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink/15 text-left text-xs font-semibold uppercase tracking-wide text-ink-2">
                <th className="px-5 py-3.5">Number</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Boxes</th>
                <th className="px-5 py-3.5 text-right">Total</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/10 transition-colors last:border-0 hover:bg-white/35">
                  <td className="px-5 py-3.5">
                    <Link href={`/quote/${r.requestId}`} className="font-semibold text-ink hover:text-brand">
                      {r.number}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-2">{r.date}</p>
                  </td>
                  <td className="px-5 py-3.5 font-display text-base font-semibold tracking-tight text-ink">{r.company}</td>
                  <td className="px-5 py-3.5 text-ink-2">
                    {r.boxes} · {r.pieces.toLocaleString("en-IN")} pcs
                  </td>
                  <td className="px-5 py-3.5 text-right text-base font-semibold tabular-nums text-[#3a2412]">{formatINR(r.totalPaise)}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge stage={r.status} />
                    {r.sentOn && <p className="mt-1 text-xs text-ink-2">{r.sentOn}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-2">
                      <a href={`/api/quotations/${r.id}/pdf`} target="_blank" rel="noreferrer" className="kraft-btn kraft-btn-sm">
                        PDF
                      </a>
                      <Link href={`/quote/new?say=${encodeURIComponent(`same as last time for ${r.company}`)}`} className="kraft-btn kraft-btn-sm kraft-btn-outline">
                        Same again
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
