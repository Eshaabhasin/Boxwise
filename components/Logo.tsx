import { APP_NAME } from "@/lib/company";

/** Box outline + wordmark. `tone` picks cream (dark band) or ink (kraft). */
export default function Logo({ tone = "ink" }: { tone?: "cream" | "ink" }) {
  const color = tone === "cream" ? "text-cream" : "text-ink";
  return (
    <span className={`inline-flex items-center gap-2 ${color}`}>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7z" strokeLinejoin="round" />
        <path d="M3.5 7 12 11.2 20.5 7M12 11.2v10" strokeLinejoin="round" />
        <path d="m7.8 4.9 8.5 4.2" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-xl font-extrabold tracking-[-0.03em]">{APP_NAME}</span>
    </span>
  );
}
