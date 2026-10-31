import { APP_NAME } from "@/lib/company";

/** Box mark + wordmark. */
export default function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 2.8 20.5 7v10L12 21.2 3.5 17V7z" strokeLinejoin="round" />
          <path d="M3.5 7 12 11.2 20.5 7M12 11.2v10" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="hidden font-display text-lg font-bold tracking-tight min-[400px]:inline">{APP_NAME}</span>
    </span>
  );
}
