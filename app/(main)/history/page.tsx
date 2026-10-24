export default function HistoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-4xl font-extrabold uppercase tracking-[0.015em]">Quotations</h2>
      <div className="border-2 border-dashed border-ink/50 p-8 text-center">
        <p className="font-display text-xl font-extrabold uppercase">Every sent quote, on file</p>
        <p className="mt-1 text-sm text-ink-2">Sent quotations and “same as last time” arrive in phase 5.</p>
      </div>
    </div>
  );
}
