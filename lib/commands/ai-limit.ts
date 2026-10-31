/**
 * The free AI plan allows about 200,000 tokens a day and each command uses
 * about 3,000, so the app stops itself at 60 a day (AI_DAILY_LIMIT changes it).
 * Approve, undo, search and the rest need no AI and keep working. Pure.
 */

export const DEFAULT_AI_DAILY_LIMIT = 60;

export const AI_LIMIT_MESSAGE = "Today's AI limit is used up, so new requests can't be read until tomorrow. Everything already saved still works.";

export function aiDailyLimit(raw: string | undefined): number {
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : DEFAULT_AI_DAILY_LIMIT;
}

/** The counter for one day, India time, so the count starts again at midnight there. */
export function aiCounterName(date: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return `ai:${day}`;
}

/** Groq's own daily limit, reached before ours. */
export function isProviderDailyLimit(error: string): boolean {
  return /tokens per day|\bTPD\b|requests per day|\bRPD\b/i.test(error);
}
