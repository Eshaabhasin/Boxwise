"use client";

import type { ReactNode } from "react";
import { SAY_EVENT } from "@/components/CommandBox";

/**
 * A button that does exactly what saying `text` into the command box does,
 * for when a tap is easier than speaking. The command box runs it, so the
 * same rules (plans, approve) apply.
 */
export default function SayButton({ text, className, children }: { text: string; className?: string; children: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent(SAY_EVENT, { detail: text }))}>
      {children}
    </button>
  );
}
