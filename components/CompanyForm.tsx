"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { CompanyProfile } from "@/lib/company";

type Editable = Pick<CompanyProfile, "name" | "address" | "phone" | "email" | "gstin" | "quotePrefix">;

const FIELDS: { key: keyof Editable; label: string; hint?: string; wide?: boolean }[] = [
  { key: "name", label: "Company name", wide: true },
  { key: "address", label: "Address", wide: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "gstin", label: "GSTIN", hint: "Its first two digits decide CGST + SGST or IGST." },
  { key: "quotePrefix", label: "Quotation number prefix", hint: "BB gives BB/2026-27/0001." },
];

/** Your letterhead, typed. (It can also be changed by voice, or on a quotation.) */
export default function CompanyForm({ company }: { company: CompanyProfile }) {
  const router = useRouter();
  const [v, setV] = useState<Editable>({
    name: company.name,
    address: company.address,
    phone: company.phone,
    email: company.email,
    gstin: company.gstin,
    quotePrefix: company.quotePrefix,
  });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setStatus(res.ok ? { ok: true, text: "Saved. New quotations use these details." } : { ok: false, text: body.error ?? "Couldn't save." });
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid content-start gap-3 p-5 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <label key={f.key} className={`flex flex-col gap-1 text-sm ${f.wide ? "sm:col-span-2" : ""}`}>
          <span className="font-medium text-ink-2">{f.label}</span>
          <input
            value={v[f.key]}
            onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))}
            className="rounded-md border border-line-strong bg-page/60 px-2.5 py-1.5 text-sm outline-none focus:border-brand focus:bg-panel focus:ring-4 focus:ring-brand/15"
          />
          {f.hint && <span className="text-xs text-ink-3">{f.hint}</span>}
        </label>
      ))}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn btn-primary">
          Save details
        </button>
        {status && <span className={`text-sm ${status.ok ? "text-ok" : "text-bad"}`}>{status.text}</span>}
      </div>
    </form>
  );
}
