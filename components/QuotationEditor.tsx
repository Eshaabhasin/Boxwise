"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { EDIT_EVENT } from "@/components/CommandBox";
import StatusBadge from "@/components/StatusBadge";
import { formatINR } from "@/lib/calc/money";
import { letterheadLines, type CompanyProfile } from "@/lib/company";
import type { QuotationEdit } from "@/lib/quote/edit";

export interface EditorQuote {
  id: string;
  number?: string;
  status: "Draft" | "Approved" | "Sent";
  date: string;
  edit: QuotationEdit;
  /** Worked out by code on the server, per line and in total. */
  amounts: number[];
  subtotalPaise: number;
  gstMode: "intra" | "inter";
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  /** Your letterhead. On a sent quotation it is the one it went out with, and can't be changed here. */
  letterhead: CompanyProfile;
  letterheadFrozen: boolean;
}

/** Whether the quotation is in edit mode; fields read it, and touching one turns it on. */
const Editing = createContext<{ on: boolean; start: () => void }>({ on: false, start: () => undefined });

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; text: string } | { kind: "error"; text: string };

function Field({
  value,
  onChange,
  onCommit,
  className = "",
  placeholder,
  multiline,
  rows = 2,
  align,
  inputMode,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  align?: "right";
  inputMode?: "decimal" | "numeric";
  label: string;
}) {
  const editing = useContext(Editing);
  const common = {
    value,
    "aria-label": label,
    placeholder: editing.on ? placeholder : undefined,
    readOnly: !editing.on,
    onFocus: () => {
      if (!editing.on) editing.start();
    },
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onBlur: onCommit,
    className: `inline-field ${editing.on ? "inline-field-on" : ""} ${align === "right" ? "text-right tabular-nums" : ""} ${className}`,
  };
  return multiline ? (
    <textarea {...common} rows={rows} className={`${common.className} resize-none`} />
  ) : (
    <input
      {...common}
      inputMode={inputMode}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/**
 * The quotation as it will print, every detail editable in place. Each field
 * saves when you leave it: quantities, rates, terms and customer details go
 * back to the enquiry (so "undo" works); wording stays on the quotation.
 * Totals come from the server, worked out by code.
 *
 * `version` changes whenever the quotation changes on the server (after a save
 * or a voice command); the document then starts again from the saved version.
 * The save note sits outside it, so it stays on screen across that restart.
 */
export default function QuotationEditor({ q, version }: { q: EditorQuote; version: string }) {
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [editing, setEditing] = useState(false);

  // "PDF edit karna hai" in the command box turns edit mode on.
  useEffect(() => {
    const on = () => setEditing(true);
    window.addEventListener(EDIT_EVENT, on);
    return () => window.removeEventListener(EDIT_EVENT, on);
  }, []);

  return (
    <Editing.Provider value={{ on: editing, start: () => setEditing(true) }}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setEditing((e) => !e)} className={`btn py-1.5 ${editing ? "btn-primary" : "btn-quiet"}`}>
            {editing ? "Done editing" : "✎ Edit quotation"}
          </button>
          <span role="status" className={`text-xs ${save.kind === "error" ? "text-bad" : save.kind === "saved" ? "text-ok" : "text-ink-3"}`}>
            {save.kind === "saving" ? "Saving…" : save.kind === "saved" || save.kind === "error" ? save.text : ""}
          </span>
        </div>
        {editing && (
          <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
            Editing: click any outlined detail and type (it saves when you leave the field), or say the change in the box on the left
            {" "}(“box 2 ka rate 21”, “notes mein likho …”, “hamari company ka naam … karo”).
            {q.status === "Sent" ? " This one was sent, so a change makes a new revision." : ""}
          </p>
        )}
        <QuotationDocument key={version} q={q} onSave={setSave} />
      </div>
    </Editing.Provider>
  );
}

/** Your letterhead on the quotation: edits go to "Your company" and show on every quotation not yet sent. */
function Letterhead({ company, frozen, onSave }: { company: CompanyProfile; frozen: boolean; onSave: (s: SaveState) => void }) {
  const router = useRouter();
  const [v, setV] = useState({ name: company.name, address: company.address, phone: company.phone, email: company.email, gstin: company.gstin });
  if (frozen) {
    return (
      <div>
        <p className="font-display text-xl font-bold">{company.name}</p>
        {letterheadLines(company).map((l) => (
          <p key={l} className="text-xs text-ink-3">
            {l}
          </p>
        ))}
      </div>
    );
  }
  const commit = async (key: keyof typeof v) => {
    if (v[key] === company[key]) return;
    onSave({ kind: "saving" });
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: v[key] }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    onSave(res.ok ? { kind: "saved", text: "Your company details saved." } : { kind: "error", text: body.error ?? "Couldn't save." });
    if (res.ok) router.refresh();
  };
  const field = (key: keyof typeof v, label: string, className: string) => (
    <Field label={label} value={v[key]} placeholder={label} onChange={(x) => setV((o) => ({ ...o, [key]: x }))} onCommit={() => void commit(key)} className={className} />
  );
  return (
    <div className="max-w-sm">
      {field("name", "Your company name", "font-display text-xl font-bold")}
      {field("address", "Your address", "text-xs text-ink-3")}
      <div className="grid grid-cols-2 gap-x-2">
        {field("phone", "Your phone", "text-xs text-ink-3")}
        {field("email", "Your email", "text-xs text-ink-3")}
      </div>
      {field("gstin", "Your GSTIN", "text-xs text-ink-3")}
    </div>
  );
}

function QuotationDocument({ q, onSave: setSave }: { q: EditorQuote; onSave: (s: SaveState) => void }) {
  const router = useRouter();
  const [edit, setEdit] = useState<QuotationEdit>(q.edit);
  const [rates, setRates] = useState<string[]>(q.edit.lines.map((l) => String(l.rate)));
  const [qtys, setQtys] = useState<string[]>(q.edit.lines.map((l) => String(l.quantity)));
  const [gst, setGst] = useState(String(q.edit.terms.gstPercent));
  const saved = useRef(JSON.stringify(q.edit));

  const commit = useCallback(
    async (next: QuotationEdit) => {
      const body = JSON.stringify(next);
      if (body === saved.current) return;
      setSave({ kind: "saving" });
      const res = await fetch(`/api/quotations/${q.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
      const reply = (await res.json().catch(() => ({}))) as { message?: string; error?: string; quotationId?: string };
      if (!res.ok) {
        setSave({ kind: "error", text: reply.error ?? "Couldn't save. Try again." });
        return;
      }
      saved.current = body;
      setSave({ kind: "saved", text: reply.message ?? "Saved." });
      router.refresh();
    },
    [q.id, router, setSave],
  );

  /** Builds the edit from the text boxes; numbers are checked here and again on the server. */
  const current = useCallback((): QuotationEdit | null => {
    const lines = edit.lines.map((l, i) => ({ ...l, quantity: Number(qtys[i]), rate: Number(rates[i]) }));
    const bad = lines.findIndex((l) => !Number.isInteger(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.rate) || l.rate < 0);
    if (bad >= 0) {
      setSave({ kind: "error", text: `Line ${bad + 1}: quantity must be a whole number and the rate a number.` });
      return null;
    }
    const gstPercent = Number(gst);
    if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 28) {
      setSave({ kind: "error", text: "GST must be between 0 and 28 percent." });
      return null;
    }
    return { ...edit, lines, terms: { ...edit.terms, gstPercent } };
  }, [edit, qtys, rates, gst, setSave]);

  const commitCurrent = () => {
    const next = current();
    if (next) void commit(next);
  };

  const setCustomer = (k: keyof QuotationEdit["customer"], v: string) => setEdit((e) => ({ ...e, customer: { ...e.customer, [k]: v } }));
  const setTerm = (k: "deliveryTime" | "paymentTerms" | "validity", v: string) => setEdit((e) => ({ ...e, terms: { ...e.terms, [k]: v } }));
  const setLine = (i: number, k: "title" | "detail", v: string) => setEdit((e) => ({ ...e, lines: e.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));

  const removeLine = (i: number) => {
    const next = current();
    if (!next || next.lines.length <= 1) return;
    void commit({ ...next, lines: next.lines.filter((_, j) => j !== i) });
  };
  const addLine = () => {
    const next = current();
    if (!next) return;
    void commit({ ...next, lines: [...next.lines, { itemId: "new", title: "Corrugated box", detail: "", quantity: 100, rate: 0 }] });
  };

  const half = edit.terms.gstPercent / 2;
  const gstRows = q.gstMode === "intra" ? [{ label: `CGST ${half}%`, paise: q.cgstPaise }, { label: `SGST ${half}%`, paise: q.sgstPaise }] : [{ label: `IGST ${edit.terms.gstPercent}%`, paise: q.igstPaise }];

  return (
      <article className="relative overflow-hidden rounded-xl border border-line bg-white p-6 shadow-sm md:p-10">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-brand" />
        {q.status === "Draft" && (
          <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] select-none font-display text-8xl font-bold text-sunk md:text-9xl">
            DRAFT
          </span>
        )}

        <header className="relative flex flex-wrap items-start justify-between gap-6">
          <Letterhead company={q.letterhead} frozen={q.letterheadFrozen} onSave={setSave} />
          <div className="text-right">
            <p className="font-display text-2xl font-bold tracking-wide text-brand">QUOTATION</p>
            <p className="mt-1 text-sm">
              <span className="text-ink-3">No. </span>
              <span className="font-semibold">{q.number ?? "Draft"}</span>
            </p>
            <p className="text-sm">
              <span className="text-ink-3">Date </span>
              {q.date}
            </p>
            <div className="mt-1 flex justify-end">
              <StatusBadge stage={q.status} />
            </div>
          </div>
        </header>

        <section className="relative mt-6 max-w-md rounded-lg border border-line p-3 text-sm">
          <p className="label-xs">Quotation for</p>
          <Field label="Company" value={edit.customer.company} onChange={(v) => setCustomer("company", v)} onCommit={commitCurrent} className="mt-1 font-display text-base font-semibold" />
          <Field label="Contact person" value={edit.customer.contactPerson} placeholder="Contact person" onChange={(v) => setCustomer("contactPerson", v)} onCommit={commitCurrent} />
          <Field label="Address" value={edit.customer.address} placeholder="Address" multiline onChange={(v) => setCustomer("address", v)} onCommit={commitCurrent} className="text-ink-2" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone" value={edit.customer.phone} placeholder="Phone" onChange={(v) => setCustomer("phone", v)} onCommit={commitCurrent} className="text-xs text-ink-2" />
            <Field label="GSTIN" value={edit.customer.gstin} placeholder="GSTIN" onChange={(v) => setCustomer("gstin", v)} onCommit={commitCurrent} className="text-xs text-ink-2" />
          </div>
        </section>

        <div className="relative mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-y border-ink bg-sunk/70 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
                <th className="w-8 px-2 py-2">#</th>
                <th className="px-2 py-2">Description</th>
                <th className="w-24 px-2 py-2 text-right">Qty</th>
                <th className="w-28 px-2 py-2 text-right">Rate (₹)</th>
                <th className="w-32 px-2 py-2 text-right">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {edit.lines.map((l, i) => (
                <tr key={l.itemId} className="border-b border-line align-top">
                  <td className="px-2 py-2.5 text-ink-3">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <Field label={`Line ${i + 1} title`} value={l.title} onChange={(v) => setLine(i, "title", v)} onCommit={commitCurrent} className="font-semibold" multiline rows={l.title.length > 24 ? 2 : 1} />
                    <Field label={`Line ${i + 1} detail`} value={l.detail} placeholder="Size, ply, flute…" onChange={(v) => setLine(i, "detail", v)} onCommit={commitCurrent} className="text-xs text-ink-2" multiline rows={l.detail.length > 42 ? 2 : 1} />
                  </td>
                  <td className="px-2 py-2.5">
                    <Field label={`Line ${i + 1} quantity`} value={qtys[i] ?? ""} inputMode="numeric" align="right" onChange={(v) => setQtys((a) => a.map((x, j) => (j === i ? v : x)))} onCommit={commitCurrent} />
                  </td>
                  <td className="px-2 py-2.5">
                    <Field label={`Line ${i + 1} rate`} value={rates[i] ?? ""} inputMode="decimal" align="right" onChange={(v) => setRates((a) => a.map((x, j) => (j === i ? v : x)))} onCommit={commitCurrent} />
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium tabular-nums">{q.amounts[i] !== undefined ? formatINR(q.amounts[i] ?? 0) : "—"}</td>
                  <td className="py-2.5 text-right">
                    {edit.lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="rounded px-1.5 text-ink-3 hover:bg-bad-soft hover:text-bad" aria-label={`Remove line ${i + 1}`}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addLine} className="mt-2 text-sm font-medium text-brand hover:underline">
            + Add a line
          </button>
        </div>

        <div className="relative mt-6 grid gap-6 md:grid-cols-[1fr_260px]">
          <section className="text-sm">
            <p className="label-xs">Terms</p>
            <div className="mt-2 grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-1.5">
              <span className="text-ink-3">Delivery</span>
              <Field label="Delivery time" value={edit.terms.deliveryTime === "—" ? "" : edit.terms.deliveryTime} placeholder="e.g. 10 days" onChange={(v) => setTerm("deliveryTime", v)} onCommit={commitCurrent} />
              <span className="text-ink-3">Payment</span>
              <Field label="Payment terms" value={edit.terms.paymentTerms === "—" ? "" : edit.terms.paymentTerms} placeholder="e.g. 50% advance" onChange={(v) => setTerm("paymentTerms", v)} onCommit={commitCurrent} />
              <span className="text-ink-3">Valid for</span>
              <Field label="Validity" value={edit.terms.validity === "—" ? "" : edit.terms.validity} placeholder="e.g. 15 days" onChange={(v) => setTerm("validity", v)} onCommit={commitCurrent} />
              <span className="text-ink-3">GST %</span>
              <Field label="GST percent" value={gst} inputMode="decimal" onChange={setGst} onCommit={commitCurrent} className="w-20" />
            </div>
            <p className="label-xs mt-4">Notes</p>
            <Field label="Notes" value={edit.notes} placeholder="Anything else to print on the quotation" multiline onChange={(v) => setEdit((e) => ({ ...e, notes: v }))} onCommit={commitCurrent} className="mt-1" />
          </section>

          <dl className="text-sm tabular-nums">
            <div className="flex justify-between px-2 py-1">
              <dt className="text-ink-2">Subtotal</dt>
              <dd>{formatINR(q.subtotalPaise)}</dd>
            </div>
            {gstRows.map((g) => (
              <div key={g.label} className="flex justify-between px-2 py-1">
                <dt className="text-ink-2">{g.label}</dt>
                <dd>{formatINR(g.paise)}</dd>
              </div>
            ))}
            {q.roundOffPaise !== 0 && (
              <div className="flex justify-between px-2 py-1">
                <dt className="text-ink-2">Round off</dt>
                <dd>{formatINR(q.roundOffPaise)}</dd>
              </div>
            )}
            <div className="mt-1 flex items-baseline justify-between border-t border-ink bg-sunk/70 px-2 py-2">
              <dt className="font-semibold">Total</dt>
              <dd className="font-display text-xl font-bold">{formatINR(q.totalPaise)}</dd>
            </div>
          </dl>
        </div>

        <div className="relative mt-10 flex justify-end text-sm">
          <div className="w-48 text-right">
            <p>For {q.letterhead.name}</p>
            <div className="mt-8 border-t border-ink" />
            <p className="mt-1 text-xs text-ink-3">Authorised signatory</p>
          </div>
        </div>
      </article>
  );
}
