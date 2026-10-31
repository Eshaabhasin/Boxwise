"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import EnquiryCard from "@/components/EnquiryCard";
import { SHARE_EVENT } from "@/components/ShareButton";
import { planSections } from "@/lib/commands/plan-sections";
import { CommandResult } from "@/lib/commands/types";

/** Dispatch this on window to put the cursor back in the command box (the header button does). */
export const FOCUS_COMMAND_EVENT = "boxbol:focus-command";
/** Dispatched when a command asks for edit mode on the quotation ("PDF edit karna hai"). */
export const EDIT_EVENT = "boxbol:edit-quote";
/** Dispatch with { detail: text } to run a command as if it was said (SayButton does). */
export const SAY_EVENT = "boxbol:say";

/** Example dictations for the board, in the way he actually speaks. */
const TRY_ONE = [
  {
    label: "Carton",
    text: "Sharma Packaging carton box 10 by 6 by 4 inch 3 ply white multicolour laminated 1000 piece",
  },
  {
    label: "Self-lock",
    text: "Verma Sweets self lock box 8 by 6 by 2 inch 3 ply brown plain no lamination 2000 piece slitter",
  },
  {
    label: "Inner carton, 2 boxes",
    text: "Gupta Foods ke do inner carton chahiye pehla 4 by 3 by 4 inch 1000 piece doosra 6 by 4 by 3 inch 2000 piece dono multicolour laminated design hum banayenge",
  },
] as const;

/** How each screen labels the box. */
const VARIANTS = {
  request: { heading: "What did the customer ask for?", hint: "All the boxes in one go is fine: “pehla box … doosra box …”. No Wispr Flow? Just type here.", submit: "Read request", rows: 4, examples: true },
  rate: { heading: "Say a change, or your rates", hint: "“Box 2 ki quantity 3000”, “slitter se banao”, “rate 21 rakho”.", submit: "Send", rows: 3, examples: false },
  company: { heading: "Change your details", hint: "“Company name Shree Packaging”, “email …”, “GSTIN …”, “phone …”, “address …”.", submit: "Save", rows: 2, examples: false },
  command: { heading: "Say what you need", hint: "“Sharma dhundo”, “REQ 4 kholo”, “same as last time for Gupta Foods”.", submit: "Send", rows: 2, examples: false },
} as const;
export type CommandVariant = keyof typeof VARIANTS;

/**
 * The dictation input. Wispr Flow types into whatever
 * is focused, so this box grabs focus on load, on every screen change, when
 * the tab comes back, and after every command.
 */
export default function CommandBox({
  variant = "command",
  aside,
  onText,
  onResult,
}: {
  variant?: CommandVariant;
  aside?: string;
  /** Called as the text changes (not when it is cleared after sending, so a checklist keeps what was said). */
  onText?: (text: string) => void;
  /** Called with every answer shown (a plan, a message), and null when it is cleared. */
  onResult?: (result: CommandResult | null) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setShown] = useState<CommandResult | null>(null);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });
  const shownPlan = useRef<string | undefined>(undefined);
  const setResult = useCallback((r: CommandResult | null) => {
    shownPlan.current = r?.kind === "plan" ? r.planId : undefined;
    setShown(r);
    onResultRef.current?.(r);
  }, []);
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
  // Your company only edits your letterhead, and New quote starts clean: old plans don't show there.
  useEffect(() => {
    if (variant === "company" || variant === "request") return;
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
  }, [pathname, setResult, variant]);

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
        body: JSON.stringify({ text: spoken, path: pathname, planId: shownPlan.current }),
      });
      const parsed = CommandResult.safeParse(await res.json().catch(() => null));
      const next: CommandResult = parsed.success
        ? parsed.data
        : { kind: "error", text: "The server sent an answer that couldn't be read. Try again." };
      setResult(next);
      if (next.kind !== "error") setText("");
      if (next.kind === "message" && next.navigateTo) {
        router.push(next.navigateTo);
      } else if (next.kind === "edit_mode") {
        window.dispatchEvent(new Event(EDIT_EVENT));
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
  }, [busy, pathname, router, focus, setResult]);

  const submit = useCallback(() => send(text.trim()), [send, text]);

  useEffect(() => {
    const onSay = (e: Event) => {
      const said = (e as CustomEvent<unknown>).detail;
      if (typeof said === "string") void send(said);
    };
    window.addEventListener(SAY_EVENT, onSay);
    return () => window.removeEventListener(SAY_EVENT, onSay);
  }, [send]);

  // Opened with ?say=… (the Quotations page's "Same again"): run it once, as if it was said here.
  const saidFromLink = useRef(false);
  useEffect(() => {
    if (saidFromLink.current) return;
    const said = new URLSearchParams(window.location.search).get("say");
    if (!said) return;
    const t = setTimeout(() => {
      saidFromLink.current = true;
      router.replace(pathname);
      void send(said);
    }, 0);
    return () => clearTimeout(t);
  }, [send, router, pathname]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }

  function fill(sample: string) {
    setText(sample);
    onText?.(sample);
    requestAnimationFrame(focus);
  }

  function clear() {
    setText("");
    onText?.("");
    setResult(null);
    requestAnimationFrame(focus);
  }

  return (
    <section className="panel overflow-hidden">
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="command" className="font-display text-base font-semibold">
            {v.heading}
          </label>
          <span className="text-xs text-ink-3">{busy ? "Working…" : aside}</span>
        </div>
        <textarea
          id="command"
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onText?.(e.target.value);
          }}
          onKeyDown={onKeyDown}
          readOnly={busy}
          rows={v.rows}
          placeholder="Speak with Wispr Flow"
          autoFocus
          autoCapitalize="off"
          spellCheck={false}
          className="mt-2 block w-full resize-none rounded-lg border border-line-strong bg-page/60 px-3 py-2.5 text-[0.95rem] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:bg-panel focus:ring-4 focus:ring-brand/15"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-3">{v.hint}</p>
          <div className="flex gap-2">
            <button type="button" onClick={clear} className="btn btn-quiet py-1.5">
              Clear
            </button>
            <button type="button" onClick={() => void submit()} disabled={busy || text.trim().length === 0} className="btn btn-primary py-1.5">
              {busy ? "Working…" : v.submit}
            </button>
          </div>
        </div>
        {v.examples && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="label-xs mr-1">Try</span>
            {TRY_ONE.map((t) => (
              <button key={t.label} type="button" onClick={() => fill(t.text)} className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-ink-2 hover:border-brand hover:text-brand">
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {result && <ResultPanel result={result} onSay={(t) => void send(t)} busy={busy} />}
    </section>
  );
}

function ResultPanel({ result, onSay, busy }: { result: CommandResult; onSay: (text: string) => void; busy: boolean }) {
  if (result.kind === "plan") {
    const plan = planSections(result.lines);
    return (
      <div className="flex flex-col gap-4 border-t border-line bg-brand-soft/40 p-5">
        <div>
          <p className="label-xs">Waiting for your approval</p>
          <p className="mt-1 font-display text-xl font-semibold tracking-tight">{result.title}</p>
        </div>

        {plan.details.length > 0 && (
          <dl className="flex flex-col gap-2.5 rounded-xl border border-line bg-panel p-4 text-sm">
            {plan.details.map((d) =>
              d.label ? (
                <div key={`${d.label}${d.value}`} className="grid grid-cols-[5.5rem_1fr] gap-3">
                  <dt className="text-ink-3">{d.label}</dt>
                  <dd className="leading-relaxed">{d.value}</dd>
                </div>
              ) : (
                <p key={d.value} className="leading-relaxed text-ink-2">
                  {d.value}
                </p>
              ),
            )}
          </dl>
        )}

        {(plan.notSaid || result.warnings.length > 0) && (
          <ul className="flex flex-col gap-1.5 rounded-xl bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
            {plan.notSaid && <li className="font-medium">Not said: {plan.notSaid}</li>}
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {plan.bill.length > 0 && (
          <div className="rounded-xl border border-line bg-panel px-4 py-2 text-sm">
            {plan.bill.map((row) => (
              <div
                key={`${row.label}${row.amount}`}
                className={`flex items-baseline justify-between gap-4 py-1.5 ${row.total ? "mt-1 border-t border-line pt-3 pb-2 text-base font-semibold" : ""}`}
              >
                <span className={row.total ? "" : "text-ink-2"}>{row.label}</span>
                <span className="shrink-0 tabular-nums">{row.amount}</span>
              </div>
            ))}
          </div>
        )}

        {plan.working.length > 0 && (
          <details className="rounded-xl border border-line bg-panel px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium text-ink-2">How the rate was worked out</summary>
            <div className="mt-3 flex flex-col gap-4">
              {plan.working.map((w) => (
                <div key={w.label}>
                  {plan.working.length > 1 && <p className="mb-1 font-medium">{w.label}</p>}
                  <ul className="flex flex-col gap-1 text-ink-2">
                    {w.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        )}

        {result.card && !plan.details.some((d) => /^Box \d+$/.test(d.label)) && <EnquiryCard card={result.card} preview />}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => onSay("approve")} className="btn btn-primary">
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => onSay("cancel")} className="btn btn-quiet">
            Cancel
          </button>
          <span className="text-xs text-ink-3">or say “approve”, “cancel”, or a correction</span>
        </div>
      </div>
    );
  }
  return (
    <p role="status" className={`border-t px-4 py-3 text-sm ${result.kind === "error" ? "border-bad/20 bg-bad-soft text-bad" : "border-line bg-ok-soft text-ok"}`}>
      {result.text}
    </p>
  );
}
