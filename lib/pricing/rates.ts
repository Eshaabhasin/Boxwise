import { z } from "zod";

/**
 * Your price list: the numbers the formula uses. Kept here, in the code. They
 * show only in the plan's folded working, never on a quotation, PDF or message.
 * Rates are rupees per square inch of sheet; charges are rupees.
 */

const Rate = z.number().nonnegative().max(100);
const Rupees = z.number().nonnegative().max(10_000_000);

const PlyRates = z.object({ 3: Rate, 5: Rate, 7: Rate });

/** One sheet-size band. A sheet fits when its short side ≤ maxShort and long side ≤ maxLong. */
export const Slab = z.object({
  name: z.string().trim().min(1).max(40),
  /** null for the last band: any sheet bigger than the others. */
  maxShort: z.number().positive().max(200).nullable(),
  maxLong: z.number().positive().max(200).nullable(),
  /** Printing the whole order: printCost for every printPerSheets sheets, never fewer than printMinSheets. */
  printCost: Rupees,
  printPerSheets: z.number().int().positive().max(1_000_000),
  printMinSheets: z.number().int().nonnegative().max(1_000_000),
  /** One-time charges. */
  die: Rupees,
  design: Rupees,
});
export type Slab = z.infer<typeof Slab>;

export const PricingRates = z.object({
  carton: PlyRates,
  selfLock: PlyRates,
  inner: z.object({ Duplex: Rate, SBS: Rate }),
  /** White outer paper costs this much more on the board. */
  whiteExtraPercent: z.number().nonnegative().max(200),
  /** Lamination per box = sheet area ÷ this (in rupees). */
  laminationDivisor: z.number().positive().max(100_000),
  /** Lamination is only possible on sheets up to this size. */
  laminationMaxShort: z.number().positive().max(200),
  laminationMaxLong: z.number().positive().max(200),
  slabs: z.array(Slab).min(1).max(6),
  defaultGstPercent: z.number().min(0).max(28),
});
export type PricingRates = z.infer<typeof PricingRates>;

export const DEFAULT_RATES: PricingRates = {
  carton: { 3: 0.031, 5: 0.046, 7: 0.066 },
  selfLock: { 3: 0.023, 5: 0.044, 7: 0.057 },
  inner: { Duplex: 0.035, SBS: 0.07 },
  whiteExtraPercent: 10,
  laminationDivisor: 250,
  laminationMaxShort: 28,
  laminationMaxLong: 40,
  slabs: [
    { name: "19 × 26", maxShort: 19, maxLong: 26, printCost: 4000, printPerSheets: 3000, printMinSheets: 3000, die: 2500, design: 3000 },
    { name: "28 × 40", maxShort: 28, maxLong: 40, printCost: 6500, printPerSheets: 3000, printMinSheets: 3000, die: 4500, design: 5000 },
    { name: "larger", maxShort: null, maxLong: null, printCost: 24000, printPerSheets: 5000, printMinSheets: 5000, die: 8000, design: 5000 },
  ],
  defaultGstPercent: 5,
};
