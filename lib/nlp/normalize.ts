import { convertNumberWords } from "@/lib/nlp/numwords";

/**
 * Cleans dictated text before it reaches the LLM. Deterministic, no AI:
 *  - "12x10x8" / "12 x 10" -> "12 by 10 by 8"
 *  - "30kg", "5ply" -> "30 kg", "5 ply"
 *  - drops pure fillers (uh, um, hmm)
 *  - spoken numbers -> digits (see numwords.ts)
 * Meaningful Hinglish words ("nahi", "matlab", "ke liye") stay, because they
 * carry corrections and context the LLM needs.
 */

const FILLERS = new Set(["uh", "uhh", "uhm", "um", "umm", "ummm", "hmm", "hmmm", "er", "erm", "ah", "aa", "aaa"]);

const UNIT_SUFFIX = /(\d)(kgs?|kilos?|mm|cm|inch(?:es)?|ply|gsm|bf|pcs|box(?:es)?|%)(?=\s|$|[.,!?;:])/gi;
const PUNCT_EDGE = /^([("'“‘]*)(.*?)([)"'”’.,!?;:]*)$/u;

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const piece of text.split(/\s+/)) {
    if (!piece) continue;
    const m = PUNCT_EDGE.exec(piece);
    const lead = m?.[1] ?? "";
    const core = m?.[2] ?? piece;
    const trail = m?.[3] ?? "";
    for (const ch of lead) tokens.push(ch);
    if (core) tokens.push(core);
    for (const ch of trail) tokens.push(ch);
  }
  return tokens;
}

function join(tokens: readonly string[]): string {
  return tokens
    .join(" ")
    .replace(/\s+([.,!?;:)%])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .trim();
}

export function normalize(text: string): string {
  let t = text.normalize("NFKC").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // 12x10x8, 12 × 10, 12*10 -> by. Repeat because matches overlap.
  for (let k = 0; k < 3; k++) t = t.replace(/(\d)\s*[x×*]\s*(?=\d)/gi, "$1 by ");
  t = t.replace(UNIT_SUFFIX, "$1 $2");
  const tokens = tokenize(t).filter((tok) => !FILLERS.has(tok.toLowerCase()));
  return join(convertNumberWords(tokens));
}

/** Every number written in the text, for checking what the LLM returns. */
export function numbersIn(text: string): Set<number> {
  const found = new Set<number>();
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) found.add(Number(m[0]));
  return found;
}
