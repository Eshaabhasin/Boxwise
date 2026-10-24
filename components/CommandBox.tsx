"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import BoxCard from "@/components/BoxCard";
import { SHARE_EVENT } from "@/components/ShareButton";
import { CommandResult } from "@/lib/commands/types";

/** Dispatch this on window to put the cursor back in the command box (the header button does). */
export const FOCUS_COMMAND_EVENT = "boxbol:focus-command";
/** Dispatch with { detail: text } to run a command as if it was said (SayButton does). */
export const SAY_EVENT = "boxbol:say";

/** Example dictations for the board, in the way he actually speaks. */
const TRY_ONE = [
  {
    label: "Sharma Packaging",
    text: "Sharma Packaging paanch sau box barah by das by aath inch paanch ply tees kilo load do colour print",
  },
  {
    label: "Verma Sweets",
    text: "Verma Sweets ke liye 2000 box chahiye 10 by 8 by 4 inch teen ply plain matlab no print stitched",
  },
  {
    label: "Anand Electricals",
    text: "Anand Electricals 300 boxes 450 by 300 by 250 mm 7 ply 40 kilo load nahi nahi 45 kilo glued",
  },
] as const;

/** How each screen labels its slip. */
const VARIANTS = {
  request: { slip: "Request slip", heading: "What did the customer ask for?", submit: "Make box card", rows: 4, examples: true },
  rate: { slip: "Card slip", heading: "Say a change, or the rate", submit: "Send", rows: 3, examples: false },
  command: { slip: "Command slip", heading: "Say the next step", submit: "Send", rows: 3, examples: false },
} as const;
export type CommandVariant = keyof typeof VARIANTS;

/**
 * The dictation input, drawn as a paper slip. Wispr Flow types into whatever
 * is focused, so this box grabs focus on load, on every screen change, when
 * the tab comes back, and after every command.
 */
export default function CommandBox({ variant = "command", aside }: { variant?: CommandVariant; aside?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const v = VARIANTS[variant];

  const focus = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  useEffect(() => {
    focus();
  }, [pathname, focus]);

  // Show a plan that is still waiting for "approve" after a reload or a screen change.
  useEffect(() => {
    let live = true;
    fetch("/api/command")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        const plan = CommandResult.safeParse((body as { plan?: unknown } | null)?.plan);
        if (live && plan.success && plan.data.kind === "plan") setResult(plan.data);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") focus();
    };
    const onFocusRequest = () => {
      focus();
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    window.addEventListener("focus", focus);
    window.addEventListener(FOCUS_COMMAND_EVENT, onFocusRequest);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener(FOCUS_COMMAND_EVENT, onFocusRequest);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [focus]);

  const send = useCallback(async (spoken: string) => {
    if (!spoken || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spoken, path: pathname }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const parsed = CommandResult.safeParse(await res.json().catch(() => null));
      const next: CommandResult = parsed.success
        ? parsed.data
        : { kind: "error", text: "The server sent an answer that couldn't be read. Try again." };
      setResult(next);
      if (next.kind !== "error") setText("");
      if (next.kind === "message" && next.navigateTo) {
        router.push(next.navigateTo);
      } else if (next.kind === "share") {
        window.dispatchEvent(new CustomEvent(SHARE_EVENT, { detail: next.quotationId }));
      } else {
        router.refresh();
      }
    } catch {
      setResult({ kind: "error", text: "Couldn't reach the server. Check the internet and try again." });
    } finally {
      setBusy(false);
      // Re-focus after React re-enables the box.
      requestAnimationFrame(focus);
    }
  }, [busy, pathname, router, focus]);

  const submit = useCallback(() => send(text.trim()), [send, text]);

  useEffect(() => {
    const onSay = (e: Event) => {
      const said = (e as CustomEvent<unknown>).detail;
      if (typeof said === "string") void send(said);
    };
    window.addEventListener(SAY_EVENT, onSay);
    return () => window.removeEventListener(SAY_EVENT, onSay);
  }, [send]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }

  function fill(sample: string) {
    setText(sample);
    requestAnimationFrame(focus);
  }

  function clear() {
    setText("");
    setResult(null);
    requestAnimationFrame(focus);
  }

  return (
    <section className="hard-shadow border-2 border-ink bg-cream text-ink">
      <div className="eyebrow flex items-center justify-between border-b-2 border-dashed border-ink/40 px-4 py-2.5 text-ink-2">
        <span>{v.slip}</span>
        <span>{busy ? "Working…" : (aside ?? "Ctrl + Enter")}</span>
      </div>

      <div className="px-4 pb-4 pt-3">
        <label htmlFor="command" className="block font-display text-lg font-extrabold uppercase tracking-[0.015em]">
          {v.heading}
        </label>
        <textarea
          id="command"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          readOnly={busy}
          rows={v.rows}
          placeholder="Speak with Wispr Flow, then press Ctrl+Enter"
          autoFocus
          autoCapitalize="off"
          spellCheck={false}
          className="ruled mt-3 block w-full resize-none border-2 border-ink px-3 font-mono text-[0.95rem] text-ink outline-none placeholder:text-ink-2/60 focus:ring-4 focus:ring-brick/30"
        />

        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
          Speak with Wispr Flow, then press
          <kbd className="border border-ink bg-paper px-1.5 font-mono text-xs text-ink">Ctrl</kbd>+
          <kbd className="border border-ink bg-paper px-1.5 font-mono text-xs text-ink">Enter</kbd>
        </p>

        {v.examples && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1 text-ink-2">Try one</span>
            {TRY_ONE.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => fill(t.text)}
                className="hard-shadow-sm border-2 border-ink bg-kraft-2 px-2.5 py-1 text-sm font-medium hover:bg-kraft"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 border-t-2 border-dashed border-ink/40 px-4 py-4">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || text.trim().length === 0}
          className="hard-shadow flex-1 border-2 border-ink bg-brick px-4 py-2.5 font-display text-lg font-extrabold uppercase tracking-[0.015em] text-cream disabled:opacity-60 sm:flex-none"
        >
          {busy ? "Working…" : v.submit}
        </button>
        <button
          type="button"
          onClick={clear}
          className="border-2 border-ink bg-paper px-4 py-2.5 font-display text-lg font-extrabold uppercase tracking-[0.015em]"
        >
          Clear
        </button>
      </div>

      {result && <ResultPanel result={result} onSay={(t) => void send(t)} busy={busy} />}
    </section>
  );
}

function ResultPanel({ result, onSay, busy }: { result: CommandResult; onSay: (text: string) => void; busy: boolean }) {
  if (result.kind === "plan") {
    return (
      <div className="border-t-2 border-ink bg-paper px-4 py-3">
        {result.card && (
          <div className="mb-4 mt-2">
            <BoxCard card={result.card} preview />
          </div>
        )}
        <p className="eyebrow text-ink-2">What I will set</p>
        <p className="mt-1 font-display text-lg font-extrabold uppercase">{result.title}</p>
        <ul className="mt-2 divide-y divide-rule font-mono text-sm">
          {result.lines.map((line) => (
            <li key={line} className="py-1.5">
              {line}
            </li>
          ))}
        </ul>
        {result.warnings.length > 0 && (
          <ul className="mt-2 text-sm text-brick">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-2">Say “approve”, or speak a correction. “Cancel” drops it.</p>
        <div className="mt-3 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onSay("approve")}
            className="hard-shadow-sm border-2 border-ink bg-brick px-4 py-2 font-display font-extrabold uppercase tracking-[0.015em] text-cream disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSay("cancel")}
            className="border-2 border-ink bg-paper px-4 py-2 font-display font-extrabold uppercase tracking-[0.015em] disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <p
      role="status"
      className={`border-t-2 border-ink px-4 py-3 text-sm ${
        result.kind === "error" ? "bg-brick text-cream" : "bg-paper text-ink"
      }`}
    >
      {result.text}
    </p>
  );
}
