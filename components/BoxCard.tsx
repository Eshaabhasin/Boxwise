import Link from "next/link";
import type { BoxCardView } from "@/lib/board";

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="eyebrow text-[0.62rem] text-ink-2">{label}</p>
      <p className="font-display text-xl font-extrabold tracking-tight">{value ?? "—"}</p>
    </div>
  );
}

function StageBadge({ stage }: { stage: BoxCardView["stage"] }) {
  const filled = stage === "New";
  return (
    <span
      className={`eyebrow px-1.5 py-0.5 text-[0.62rem] ${
        filled ? "bg-brick text-cream" : "border border-ink text-ink"
      }`}
    >
      {stage}
    </span>
  );
}

/** A request card drawn as a cardboard box: striped flaps, tape, specs, and what it is waiting on. */
export default function BoxCard({ card, href, preview }: { card: BoxCardView; href?: string; preview?: boolean }) {
  const link = href ?? `/quote/${card.id}`;
  return (
    <article className="hard-shadow relative border-2 border-ink bg-kraft-2">
      <div className="flap h-7 border-b-2 border-ink" />
      <div aria-hidden="true" className="absolute left-1/2 top-[-6px] h-12 w-14 -translate-x-1/2 rotate-[-2deg] border border-ink/30 bg-cream/90" />

      <div className="px-4 pb-4 pt-6">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-[0.65rem] text-ink-2">{card.ref ?? "REQ-—"}</span>
          <StageBadge stage={card.stage} />
        </div>
        <h3 className="mt-2 font-display text-2xl font-extrabold uppercase leading-tight tracking-[0.015em]">
          {card.company}
        </h3>
        <div className="mt-3 border-t-2 border-dashed border-ink/40" />

        <div className="mt-3">
          <p className="eyebrow text-[0.62rem] text-ink-2">Size</p>
          <p className="font-display text-xl font-extrabold tracking-tight">{card.size ?? "—"}</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Ply" value={card.ply} />
          <Stat label="Load" value={card.load} />
          <Stat label="Qty" value={card.quantity} />
        </div>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="eyebrow text-[0.62rem] text-ink-2">Print</span>
          <span className="font-display text-lg font-extrabold uppercase tracking-[0.015em]">{card.print ?? "—"}</span>
        </p>

        {card.missing.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="eyebrow -rotate-2 border-2 border-brick px-1.5 py-0.5 text-[0.62rem] font-bold text-brick">
              Not said
            </span>
            {card.missing.map((m) => (
              <span key={m} className="eyebrow border border-ink/60 bg-paper/60 px-1.5 py-0.5 text-[0.6rem]">
                {m}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-end justify-between gap-3">
          {preview ? (
            <span className="eyebrow text-[0.6rem] text-ink-2">Preview · not saved yet</span>
          ) : (
            <Link
              href={link}
              className="hard-shadow-sm border-2 border-ink bg-ink px-3.5 py-2 font-display text-sm font-extrabold uppercase tracking-[0.015em] text-cream"
            >
              {card.stage === "New" ? "Add rate" : "Open"}
            </Link>
          )}
          {card.waitingOn && (
            <p className="text-right">
              <span className="eyebrow block text-[0.58rem] text-ink-2">Waiting on</span>
              <span className="font-display text-sm font-extrabold uppercase tracking-[0.015em]">{card.waitingOn}</span>
            </p>
          )}
        </div>
      </div>
      <div className="flap h-3 border-t-2 border-ink" />
    </article>
  );
}
