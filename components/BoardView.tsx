import Link from "next/link";
import BoxCard from "@/components/BoxCard";
import { BOARD_FILTERS, type BoardFilter, type BoxCardView } from "@/lib/board";

const FILTER_HINT: Record<BoardFilter, string> = {
  Pending: "Everything still open: new, quoted and sent",
  New: "Cards without a rate yet",
  Quoted: "PDF approved, not yet shared",
  Sent: "Shared on WhatsApp, waiting for the customer",
  Won: "Orders that came through",
  Lost: "Closed without an order",
  All: "Every request",
};

interface Props {
  filter: BoardFilter;
  counts: Record<BoardFilter, number>;
  cards: BoxCardView[];
  q: string;
  /** Base path for filter links (the design preview reuses this view). */
  basePath?: string;
  cardHref?: (card: BoxCardView) => string;
  error?: string;
}

export default function BoardView({ filter, counts, cards, q, basePath = "/board", cardHref, error }: Props) {
  const query = (f: BoardFilter) => (q ? { filter: f, q } : { filter: f });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-4xl font-extrabold uppercase tracking-[0.015em]">Your boxes</h2>
        <p className="eyebrow text-ink-2">
          {counts[filter]} {counts[filter] === 1 ? "request" : "requests"}
        </p>
      </div>

      <nav aria-label="Filter requests" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:px-0">
        {BOARD_FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Link
              key={f}
              href={{ pathname: basePath, query: query(f) }}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 border-2 border-ink px-3 py-1.5 text-sm font-semibold ${
                active ? "hard-shadow-sm bg-ink text-cream" : "bg-kraft-2 text-ink hover:bg-cream"
              } ${f === "All" ? "md:ml-auto" : ""}`}
            >
              {f} <span className="font-mono text-xs opacity-70">{counts[f]}</span>
            </Link>
          );
        })}
      </nav>

      <p className="-mt-3 text-sm text-ink-2">
        {FILTER_HINT[filter]}
        {q && (
          <>
            {" "}· matching “{q}” ·{" "}
            <Link href={{ pathname: basePath, query: { filter } }} className="underline">
              clear search
            </Link>
          </>
        )}
      </p>

      {error ? (
        <div className="hard-shadow border-2 border-ink bg-cream p-4">
          <p className="font-display text-lg font-extrabold uppercase">Can&apos;t reach the database</p>
          <p className="mt-1 text-sm text-ink-2">
            Put your MongoDB Atlas connection string in <code className="font-mono">MONGODB_URI</code> in{" "}
            <code className="font-mono">.env.local</code>, then restart <code className="font-mono">npm run dev</code>.
          </p>
          <p className="mt-2 font-mono text-xs text-ink-2">{error}</p>
        </div>
      ) : cards.length === 0 ? (
        <div className="border-2 border-dashed border-ink/50 p-8 text-center">
          <p className="font-display text-xl font-extrabold uppercase">No {filter === "All" ? "" : filter.toLowerCase()} boxes yet</p>
          <p className="mt-1 text-sm text-ink-2">Press “Start a quote” and dictate a request; its card shows up here.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <li key={card.id}>
              <BoxCard card={card} href={cardHref?.(card)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
