import type { Stage } from "@/lib/fields";

const STYLE: Record<Stage | "Draft" | "Approved", string> = {
  New: "bg-sunk text-ink-2",
  Draft: "bg-sunk text-ink-2",
  Quoted: "bg-brand-soft text-brand",
  Approved: "bg-brand-soft text-brand",
  Sent: "bg-warn-soft text-warn",
  Won: "bg-ok-soft text-ok",
  Lost: "bg-bad-soft text-bad",
};

export default function StatusBadge({ stage }: { stage: keyof typeof STYLE }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[stage]}`}>{stage}</span>;
}
