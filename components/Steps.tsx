const STEPS = ["Enquiry", "Rates", "Approve", "Send"] as const;

/** Where a quotation is: enquiry → rates → approve → send. `current` is 1-based; 5 means all done (sent). */
export default function Steps({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                done ? "bg-ok text-white" : active ? "bg-brand text-white" : "border border-line-strong text-ink-3"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={`hidden font-medium sm:inline ${active ? "text-ink" : "text-ink-3"}`}>{label}</span>
            {n < STEPS.length && <span className="mx-1 h-px w-6 bg-line-strong sm:w-10" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
