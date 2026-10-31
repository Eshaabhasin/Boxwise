import Link from "next/link";
import { Suspense } from "react";
import EnquiryCard from "@/components/EnquiryCard";
import SearchBox from "@/components/SearchBox";
import { BOARD_FILTERS, type BoardFilter, type BoxCardView } from "@/lib/board";

const FILTER_HINT: Record<BoardFilter, string> = {
  Pending: "Everything still open: new, quoted and sent.",
  New: "Enquiries without an approved quotation yet.",
  Quoted: "Quotation approved, not yet shared.",
  Sent: "Sent to the customer, waiting for their reply.",
  Won: "Orders that came through.",
  Lost: "Closed without an order.",
  All: "Every enquiry.",
};

interface Props {
  filter: BoardFilter;
  counts: Record<BoardFilter, number>;
  cards: BoxCardView[];
  q: string;
  error?: string;
}

export default function BoardView({ filter, counts, cards, q, error }: Props) {
  const query = (f: BoardFilter) => (q ? { filter: f, q } : { filter: f });

  return (
    <div className="flex flex-col gap-5">
      <div aria-hidden="true" className="kraft-sheet pointer-events-none fixed inset-0 -z-10" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Enquiries</h1>
          <p className="mt-1 text-sm text-ink-2">{FILTER_HINT[filter]}</p>
        </div>
        <Link href="/quote/new" className="btn btn-primary sm:hidden">
          New quote
        </Link>
      </div>

      <Suspense>
        <SearchBox initial={q} kraft />
      </Suspense>

      <nav aria-label="Filter enquiries" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="glass flex gap-1 p-1">
          {BOARD_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Link
                key={f}
                href={{ pathname: "/board", query: query(f) }}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "text-ink-2 hover:bg-sunk"}`}
              >
                {f} <span className={active ? "text-white/70" : "text-ink-3"}>{counts[f]}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {error ? (
        <div className="panel border-bad/30 bg-bad-soft p-4 text-sm text-bad">
          <p className="font-semibold">Can&apos;t reach the database.</p>
          <p className="mt-1">Check MONGODB_URI in .env.local, then restart the server.</p>
          <p className="mt-2 text-xs opacity-80">{error}</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="panel border-dashed p-10 text-center">
          {q ? (
            <>
              <p className="font-display text-lg font-semibold">Nothing matches “{q}”</p>
              <p className="mt-1 text-sm text-ink-2">Try part of the company name, or a number like “REQ 4”{filter === "All" ? "" : ", or look under All"}.</p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-semibold">No {filter === "All" ? "" : filter.toLowerCase()} enquiries yet</p>
              <p className="mt-1 text-sm text-ink-2">Press “New quote” and dictate a request. Its card shows up here.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id}>
              <EnquiryCard card={card} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
