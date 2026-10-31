"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const WAIT_MS = 350;

/**
 * Search on the Enquiries and Quotations pages. It has focus when the page opens, so Wispr
 * Flow types straight into it; the list updates as the words arrive.
 */
export default function SearchBox({
  initial,
  label = "Search enquiries by company or REQ number",
  kraft,
}: {
  initial: string;
  label?: string;
  /** Pill shape for the kraft pages. */
  kraft?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const search = (text: string) => {
    const next = new URLSearchParams(params.toString());
    if (text.trim()) next.set("q", text.trim());
    else next.delete("q");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onChange = (text: string) => {
    setValue(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(text), WAIT_MS);
  };

  return (
    <div className="relative max-w-xl">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        enterKeyHint="search"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") search(value);
          if (e.key === "Escape") onChange("");
        }}
        placeholder="Speak with Wispr Flow"
        aria-label={label}
        className={`block w-full py-2.5 pl-10 pr-20 text-[0.95rem] text-ink outline-none focus:ring-4 focus:ring-brand/15 ${
          kraft
            ? "rounded-full border-2 border-[#4a2e16]/40 bg-white/55 placeholder:text-ink-2 focus:border-[#4a2e16]"
            : "rounded-lg border border-line-strong bg-panel placeholder:text-ink-3 focus:border-brand"
        }`}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-sunk">
          Clear
        </button>
      )}
    </div>
  );
}
