/** Box dimensions are stored in millimetres; this converts to and from the unit he spoke. */

export const LENGTH_UNITS = ["mm", "cm", "inch"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

const MM_PER: Record<LengthUnit, number> = { mm: 1, cm: 10, inch: 25.4 };

export function isLengthUnit(value: unknown): value is LengthUnit {
  return LENGTH_UNITS.some((u) => u === value);
}

/** Rounds to 0.01 mm so 12 inch is exactly 304.8, not 304.79999. */
export function toMm(value: number, unit: LengthUnit): number {
  return Math.round(value * MM_PER[unit] * 100) / 100;
}

/** Back to the spoken unit, rounded to 2 decimals (12 inch round-trips to 12). */
export function fromMm(mm: number, unit: LengthUnit): number {
  return Math.round((mm / MM_PER[unit]) * 100) / 100;
}

const UNIT_LABEL: Record<LengthUnit, string> = { mm: "MM", cm: "CM", inch: "IN" };

/** "12 × 10 × 8 IN", or null when any side is missing. */
export function formatSize(
  lengthMm: number | null | undefined,
  breadthMm: number | null | undefined,
  heightMm: number | null | undefined,
  unit: LengthUnit,
): string | null {
  if (lengthMm == null || breadthMm == null || heightMm == null) return null;
  const sides = [lengthMm, breadthMm, heightMm].map((mm) => String(fromMm(mm, unit)));
  return `${sides.join(" × ")} ${UNIT_LABEL[unit]}`;
}
