import type { HistoryEntry } from "@/lib/models/Request";

/** Pure helpers for reading and reversing a card's history (no database). */

export const CREATED_SUMMARY = "Card made from dictation";

/**
 * What a history entry did. Entries from before phase 3 have no action (or a
 * default "edit" saved onto them later); the one that made the card is always
 * the first, with the "Card made from dictation" summary.
 */
export function entryAction(entry: Pick<HistoryEntry, "action" | "summary">, index: number): NonNullable<HistoryEntry["action"]> {
  if (index === 0 && entry.summary === CREATED_SUMMARY) return "create";
  return entry.action ?? (index === 0 ? "create" : "edit");
}

/** Takes the texts a change added back off the card's dictation list (newest copies first). */
export function removeTexts(rawTexts: { text: string; at: Date }[], texts: readonly string[]): { text: string; at: Date }[] {
  const out = [...rawTexts];
  for (const t of texts) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i]?.text === t) {
        out.splice(i, 1);
        break;
      }
    }
  }
  return out;
}

