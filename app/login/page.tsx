"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? "Couldn't log in");
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh flex-col px-4 py-4 md:px-8">
      <Logo />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8">
        <div className="text-center">
          <p className="eyebrow text-brick">Owner login</p>
          <h1 className="mt-3 font-display text-6xl font-extrabold leading-[0.9] tracking-[-0.045em]">
            Bolo,
            <br />
            box ready.
          </h1>
        </div>
        <form onSubmit={onSubmit} className="hard-shadow flex flex-col gap-3 border-2 border-ink bg-cream p-4">
          <label htmlFor="passcode" className="eyebrow text-ink-2">
            Passcode
          </label>
          <input
            id="passcode"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="border-2 border-ink bg-paper px-3 py-3 font-mono text-lg outline-none focus:ring-4 focus:ring-brick/30"
          />
          {error && <p className="text-sm font-medium text-brick">{error}</p>}
          <button
            type="submit"
            disabled={busy || passcode.length === 0}
            className="hard-shadow border-2 border-ink bg-brick px-4 py-3 font-display text-lg font-extrabold uppercase tracking-[0.015em] text-cream disabled:opacity-60"
          >
            {busy ? "Checking…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}
