/**
 * Short control words are recognised by code, not the LLM: they must work
 * instantly and never be misread. Only short utterances count, so "approve"
 * inside a long sentence is not taken as approval.
 */

export type FastCommand = "approve" | "cancel" | "undo";

const PHRASES: Record<FastCommand, readonly string[]> = {
  approve: [
    "approve", "approved", "approve it", "ok", "okay", "ok approve", "haan", "haan ji", "ha", "han", "ji haan",
    "theek hai", "thik hai", "theek", "sahi hai", "done", "yes", "save", "save it", "confirm", "ho gaya", "chalega",
    "haan approve", "haan theek hai", "ok done", "yes approve", "approve karo", "approve kar do",
  ],
  cancel: [
    "cancel", "cancel it", "cancel karo", "cancel kar do", "rehne do", "rahne do", "chhodo", "chodo", "discard",
    "nahi chahiye", "mat karo", "drop it", "forget it", "no cancel",
  ],
  undo: ["undo", "undo karo", "undo kar do", "wapas karo", "wapas", "pehle jaisa karo", "pehle jaisa kar do", "revert"],
};

const POLITE = new Set(["please", "plz", "pls", "ji", "bhai", "na", "abhi", "now", "the", "this", "that", "plan"]);

function clean(text: string): string {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !POLITE.has(w)).join(" ");
}

export function fastCommand(text: string): FastCommand | null {
  const c = clean(text);
  if (!c || c.split(" ").length > 4) return null;
  for (const [cmd, phrases] of Object.entries(PHRASES) as [FastCommand, readonly string[]][]) {
    if (phrases.some((p) => clean(p) === c)) return cmd;
  }
  return null;
}
