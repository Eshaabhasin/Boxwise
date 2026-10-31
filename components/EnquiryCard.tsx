import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import type { BoxCardView } from "@/lib/board";
import { splitSummary } from "@/lib/card";

/** One enquiry on the board: company, each box in its own block, what it is waiting on. */
export default function EnquiryCard({ card, href, preview }: { card: BoxCardView; href?: string; preview?: boolean }) {
  const body = (
    <article className={`flex h-full flex-col gap-3 p-4 ${preview ? "panel" : "glass glass-hover"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-2">{card.ref ?? "New enquiry"}</p>
          <h3 className="mt-0.5 truncate font-display text-xl font-semibold tracking-tight text-ink">{card.company}</h3>
        </div>
        <StatusBadge stage={card.stage} />
      </div>

      <ul className="flex flex-col gap-2">
        {card.boxes.map((b) => {
          const s = splitSummary(b.summary);
          return (
            <li key={b.label} className="rounded-lg border border-white/60 bg-white/50 px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold text-ink">{s.title || b.label}</p>
                {s.rate && <p className="shrink-0 text-sm font-semibold tabular-nums text-brand">{s.rate}</p>}
              </div>
              {s.details && <p className="mt-0.5 text-[0.8rem] leading-snug text-ink-2">{s.details}</p>}
            </li>
          );
        })}
        {card.boxCount > card.boxes.length && <li className="px-1 text-sm text-ink-2">+ {card.boxCount - card.boxes.length} more</li>}
      </ul>

      {card.missing.length > 0 && (
        <p className="text-[0.8rem] text-warn">
          <span className="font-semibold">Not said:</span> {card.missing.join(", ")}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-ink/10 pt-3 text-[0.8rem] text-ink-2">
        <span>
          {card.boxCount} {card.boxCount === 1 ? "box" : "boxes"}
          {card.totalQuantity && <> · {card.totalQuantity} pcs</>}
        </span>
        {card.waitingOn && (
          <span>
            Waiting on <span className="font-semibold text-ink">{card.waitingOn.toLowerCase()}</span>
          </span>
        )}
      </div>
    </article>
  );
  if (preview) return body;
  return (
    <Link href={href ?? `/quote/${card.id}`} className="block h-full">
      {body}
    </Link>
  );
}
