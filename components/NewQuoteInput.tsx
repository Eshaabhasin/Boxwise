"use client";

import { useState } from "react";
import CommandBox from "@/components/CommandBox";
import { CHECKLIST, checklistFromUnderstood, checklistState, type Understood } from "@/lib/checklist";
import type { CommandResult } from "@/lib/commands/types";

/**
 * The New quote box, with what to say beside it. While he speaks, the ticks
 * follow the words typed; once the request is read, they show what GPT
 * actually understood (the same as the plan's "Not said" line).
 */
export default function NewQuoteInput() {
  const [text, setText] = useState("");
  const [understood, setUnderstood] = useState<Understood | null>(null);

  const onResult = (r: CommandResult | null) => {
    if (r?.kind === "plan" && r.understood) {
      setUnderstood(r.understood);
      setText("");
    } else if (r === null || r.kind === "message") {
      setUnderstood(null);
    }
  };

  const fromGpt = understood !== null && text === "";
  const state = fromGpt ? checklistFromUnderstood(understood) : checklistState(text);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <CommandBox variant="request" onText={setText} onResult={onResult} />

      <aside className="panel p-5 text-sm" aria-label="What to say">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-base font-semibold text-ink">Say these</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${fromGpt ? "bg-ok-soft text-ok" : "bg-sunk text-ink-3"}`}>
            {fromGpt ? "As understood" : "As you speak"}
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {CHECKLIST.map((item) => {
            const s = state[item.key];
            const missed = fromGpt && s === "todo" && !item.optional;
            return (
              <li key={item.key} className={`flex items-baseline gap-2 ${s === "not needed" ? "text-ink-3 line-through" : ""}`}>
                <span
                  aria-hidden="true"
                  className={`inline-flex h-4 w-4 shrink-0 translate-y-0.5 items-center justify-center rounded-full border text-[0.6rem] ${
                    s === "heard" ? "border-ok bg-ok text-white" : missed ? "border-warn bg-warn-soft text-warn" : "border-line-strong"
                  }`}
                >
                  {s === "heard" ? "✓" : missed ? "!" : ""}
                </span>
                <span className={s === "heard" ? "text-ink" : missed ? "text-warn" : "text-ink-2"}>
                  {item.label}
                  {item.optional && <span className="text-ink-3"> (optional)</span>}
                  <span className="text-ink-3"> · {item.say}</span>
                </span>
                <span className="sr-only">{s === "heard" ? (fromGpt ? "understood" : "heard") : s === "not needed" ? "not needed" : "not said yet"}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          {fromGpt
            ? "Ticks show what was understood. Say anything marked ! to add it, or correct the plan by speaking."
            : "The rate is worked out from your rates. Anything not said is asked for, not guessed, and nothing is saved until you say “approve”."}
        </p>
      </aside>
    </div>
  );
}
