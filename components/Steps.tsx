const STEPS = ["Request card", "Rate by voice", "Approve", "Send"] as const;
const SHORT = ["Card", "Rate", "Approve", "Send"] as const;

/** The four-step tracker from the reference PDF. `current` is 1-based. */
export default function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="grid grid-cols-4 gap-2 md:gap-4">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        const box = done
          ? "border-ink bg-ink text-cream"
          : active
            ? "hard-shadow border-ink bg-brick text-cream"
            : "border-dashed border-ink text-ink";
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={`flex flex-col items-center gap-1 border-2 px-2 py-2.5 md:flex-row md:gap-3 md:px-3 ${box}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 font-mono text-xs font-bold ${
                done || active ? "border-cream" : "border-ink"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className="font-display text-xs font-extrabold uppercase tracking-[0.015em] md:text-base">
              <span className="md:hidden">{SHORT[i]}</span>
              <span className="hidden md:inline">{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
