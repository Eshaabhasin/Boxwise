import Link from "next/link";
import CommandBox from "@/components/CommandBox";
import SayButton from "@/components/SayButton";
import { formatINR } from "@/lib/calc/money";
import { connectDb } from "@/lib/db";
import { Quotation } from "@/lib/models";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function day(d: Date | undefined): string {
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
}

// Every approved and sent quotation, newest first, re-downloadable.
export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  let error = "";
  let rows: {
    id: string;
    requestId: string;
    number: string;
    company: string;
    date: string;
    sentOn: string | null;
    status: string;
    quantity: number;
    ratePaise: number;
    totalPaise: number;
    item: string;
  }[] = [];
  try {
    await connectDb();
    const filter = {
      status: { $in: ["Approved", "Sent"] as ("Approved" | "Sent")[] },
      ...(q ? { "customerSnapshot.company": { $regex: escapeRegex(q), $options: "i" } } : {}),
    };
    const docs = await Quotation.find(filter).sort({ approvedAt: -1 }).limit(300).lean();
    rows = docs.map((d) => ({
      id: d._id.toString(),
      requestId: d.requestId.toString(),
      number: d.number ?? "—",
      company: d.customerSnapshot.company,
      date: day(d.approvedAt ?? d.createdAt),
      sentOn: d.sentAt ? day(d.sentAt) : null,
      status: d.status,
      quantity: d.quantity,
      ratePaise: d.ratePaise,
      totalPaise: d.totalPaise,
      item: [d.itemTitle, d.itemDetail].filter(Boolean).join(" · "),
    }));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex flex-col gap-8 pt-4">
      <div className="max-w-2xl">
        <CommandBox variant="command" aside="Search, repeat" />
        <p className="mt-3 text-sm text-ink-2">Try: “Sharma ki history”, or “same as last time for Sharma Packaging”.</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-4xl font-extrabold uppercase tracking-[0.015em]">Quotations</h2>
        <p className="eyebrow text-ink-2">
          {rows.length} {rows.length === 1 ? "quotation" : "quotations"}
          {q && (
            <>
              {" "}
              · matching “{q}” ·{" "}
              <Link href="/history" className="underline">
                show all
              </Link>
            </>
          )}
        </p>
      </div>

      {error ? (
        <p className="border-2 border-ink bg-cream p-4 text-sm">Can&apos;t load quotations: {error}</p>
      ) : rows.length === 0 ? (
        <div className="border-2 border-dashed border-ink/50 p-8 text-center">
          <p className="font-display text-xl font-extrabold uppercase">{q ? "No quotations match" : "No quotations yet"}</p>
          <p className="mt-1 text-sm text-ink-2">Approved and sent quotations appear here, with their PDFs.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => (
            <li key={r.id} className="hard-shadow border-2 border-ink bg-cream">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-dashed border-ink/30 px-4 py-3">
                <div>
                  <p className="eyebrow text-ink-2">
                    {r.number} · {r.date}
                  </p>
                  <p className="font-display text-xl font-extrabold uppercase tracking-[0.015em]">{r.company}</p>
                </div>
                <span
                  className={`eyebrow px-1.5 py-0.5 text-[0.62rem] ${r.status === "Sent" ? "bg-ink text-cream" : "border border-ink text-ink"}`}
                >
                  {r.status === "Sent" ? `Sent ${r.sentOn ?? ""}` : "Not sent yet"}
                </span>
              </div>
              <div className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <p className="text-sm">{r.item}</p>
                  <p className="mt-1 font-mono text-xs text-ink-2">
                    {r.quantity.toLocaleString("en-IN")} × {formatINR(r.ratePaise)} · total {formatINR(r.totalPaise)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/quote/${r.requestId}`} className="border-2 border-ink bg-paper px-3 py-1.5 text-sm font-semibold">
                    Open card
                  </Link>
                  <a href={`/api/quotations/${r.id}/pdf`} target="_blank" rel="noreferrer" className="border-2 border-ink bg-paper px-3 py-1.5 text-sm font-semibold">
                    PDF
                  </a>
                  <SayButton
                    text={`same as last time for ${r.company}`}
                    className="hard-shadow-sm border-2 border-ink bg-ink px-3 py-1.5 text-sm font-semibold text-cream"
                  >
                    Same as last time
                  </SayButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
