/**
 * Turns spoken number words (English and Hinglish) into digits, in code, so
 * the LLM never does arithmetic and the guard can check every number it
 * returns against the dictated text.
 *
 *   "paanch sau box barah by das by aath inch" -> "500 box 12 by 10 by 8 inch"
 *   "dhai hazaar" -> "2500",  "saade aath" -> "8.5",  "two thousand five hundred" -> "2500"
 *
 * Words that are also ordinary Hindi/English words ("do", "saath", "bara",
 * "tera", "sat") are converted only when the next word is a unit, a box word
 * or another number, or the previous word is "by":
 *   "do colour" -> "2 colour", but "height 9 inch kar do" keeps "do".
 */

type Kind = "unit" | "teen" | "tens" | "whole";

interface Word {
  value: number;
  /**
   * unit  0-9, may follow an English tens word ("twenty five")
   * teen  10-19 English
   * tens  20, 30... English, may be followed by a unit
   * whole a complete Hindi number (11-99) or dedh/dhai; nothing joins after it except a multiplier
   */
  kind: Kind;
}

const WORDS: Record<string, Word> = {};
function add(kind: Kind, value: number, ...spellings: string[]) {
  for (const s of spellings) WORDS[s] = { value, kind };
}

// English
add("unit", 0, "zero");
add("unit", 1, "one");
add("unit", 2, "two");
add("unit", 3, "three");
add("unit", 4, "four");
add("unit", 5, "five");
add("unit", 6, "six");
add("unit", 7, "seven");
add("unit", 8, "eight");
add("unit", 9, "nine");
add("teen", 10, "ten");
add("teen", 11, "eleven");
add("teen", 12, "twelve");
add("teen", 13, "thirteen");
add("teen", 14, "fourteen");
add("teen", 15, "fifteen");
add("teen", 16, "sixteen");
add("teen", 17, "seventeen");
add("teen", 18, "eighteen");
add("teen", 19, "nineteen");
add("tens", 20, "twenty");
add("tens", 30, "thirty");
add("tens", 40, "forty", "fourty");
add("tens", 50, "fifty");
add("tens", 60, "sixty");
add("tens", 70, "seventy");
add("tens", 80, "eighty");
add("tens", 90, "ninety");

// Hinglish 1-9
add("unit", 1, "ek");
add("unit", 2, "do", "doh");
add("unit", 3, "teen");
add("unit", 4, "char", "chaar");
add("unit", 5, "paanch", "panch", "paach", "panchh");
add("unit", 6, "chhe", "chhah", "che", "chah", "chheh", "chhey");
add("unit", 7, "saat", "sat");
add("unit", 8, "aath", "aat", "ath");
add("unit", 9, "nau");

// Hinglish 10-99 (each is one word in Hindi)
add("whole", 10, "das", "dus");
add("whole", 11, "gyarah", "gyara", "gyaarah");
add("whole", 12, "barah", "bara", "baarah", "baara");
add("whole", 13, "terah", "tera");
add("whole", 14, "chaudah", "chauda", "chodah");
add("whole", 15, "pandrah", "pandra", "pundrah");
add("whole", 16, "solah", "sola");
add("whole", 17, "satrah", "satra");
add("whole", 18, "atharah", "athara", "attharah");
add("whole", 19, "unnees", "unnis", "unees");
add("whole", 20, "bees", "bis");
add("whole", 21, "ikkees", "ikkis");
add("whole", 22, "baais", "bais");
add("whole", 23, "teis", "tees-teen");
add("whole", 24, "chaubees", "chaubis", "chobis");
add("whole", 25, "pachchees", "pachees", "pachis", "pachchis");
add("whole", 26, "chhabbees", "chhabbis");
add("whole", 27, "sattaais", "sattais");
add("whole", 28, "atthaais", "atthais");
add("whole", 29, "untees", "untis");
add("whole", 30, "tees", "tis");
add("whole", 32, "battees", "batees", "battis");
add("whole", 35, "paintees", "paintis");
add("whole", 36, "chhattees", "chhattis");
add("whole", 40, "chalees", "chalis", "chaalis", "chaalees");
add("whole", 45, "paintalees", "paintalis");
add("whole", 48, "adtalees", "artalis");
add("whole", 50, "pachas", "pachaas", "pachaas");
add("whole", 60, "saath", "sath");
add("whole", 70, "sattar");
add("whole", 75, "pachhattar", "pachattar");
add("whole", 80, "assi");
add("whole", 90, "nabbe");
add("whole", 1.5, "dedh", "derh");
add("whole", 2.5, "dhai", "dhaai", "adhai", "dhaee");

const MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  sau: 100,
  so: 0, // placeholder removed below; "so" is too common in English
  thousand: 1000,
  hazaar: 1000,
  hazar: 1000,
  hajar: 1000,
  hajaar: 1000,
  lakh: 100000,
  lakhs: 100000,
  lac: 100000,
};
delete MULTIPLIERS.so;

/** saade 8 = 8.5, sava 8 = 8.25, paune 8 = 7.75 */
const ADJUSTERS: Record<string, number> = {
  saade: 0.5,
  sade: 0.5,
  saadhe: 0.5,
  sava: 0.25,
  sawa: 0.25,
  paune: -0.25,
  pone: -0.25,
};

const AMBIGUOUS = new Set(["do", "doh", "saath", "sath", "bara", "baara", "tera", "sat", "ath"]);

/** Even more ambiguous ("bara" = big, "tera" = your): numbers only right next to "by" / "x". */
const SIZE_ONLY = new Set(["bara", "baara", "tera"]);

/** Words after which an ambiguous number word really is a number. */
const UNIT_WORDS = new Set([
  "box", "boxes", "piece", "pieces", "pcs", "pc", "nag", "peti", "ply", "kilo", "kilos", "kg", "kgs",
  "inch", "inches", "in", "cm", "mm", "colour", "colours", "color", "colors", "rang", "din", "days", "day",
  "hafte", "week", "weeks", "percent", "%", "by", "x", "rupees", "rupaye", "rupaiye", "rupaiya", "rs",
  "paise", "layer", "layers", "partition", "partitions", "khana", "khane", "gsm", "bf", "point",
]);

function isDigits(t: string): boolean {
  return /^\d+(\.\d+)?$/.test(t);
}

function lower(t: string | undefined): string {
  return (t ?? "").toLowerCase();
}

function startsNumber(t: string | undefined): boolean {
  const w = lower(t);
  return isDigits(w) || w in WORDS || w in MULTIPLIERS || w in ADJUSTERS;
}

function ambiguousIsNumber(tokens: readonly string[], i: number): boolean {
  const prev = lower(tokens[i - 1]);
  const next = lower(tokens[i + 1]);
  if (prev === "by" || prev === "x") return true;
  if (SIZE_ONLY.has(lower(tokens[i]))) return next === "by" || next === "x";
  if (UNIT_WORDS.has(next)) return true;
  if (next in MULTIPLIERS) return true;
  return startsNumber(tokens[i + 1]) && !AMBIGUOUS.has(next);
}

function format(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10000) / 10000);
}

/** Reads one number phrase starting at tokens[i]. Returns null if tokens[i] does not start one. */
function readNumber(tokens: readonly string[], i: number): { value: number; end: number } | null {
  let j = i;
  let adjust = 0;
  const first = lower(tokens[j]);
  if (first in ADJUSTERS) {
    const after = lower(tokens[j + 1]);
    if (!(isDigits(after) || (after in WORDS && !AMBIGUOUS.has(after)) || (after in WORDS && ambiguousIsNumber(tokens, j + 1)))) {
      return null;
    }
    adjust = ADJUSTERS[first] ?? 0;
    j += 1;
  }

  let total = 0;
  let current = 0;
  let last: Kind | "digit" | "mult" | "and" | null = null;
  let any = false;

  for (; j < tokens.length; j++) {
    const raw = tokens[j] ?? "";
    const w = raw.toLowerCase();

    // After "sau"/"hazaar", a number followed by "by" starts a size, not more of this number:
    // "paanch sau barah by das" is 500, then 12 by 10.
    const startsSize = (last === "mult" || last === "and") && ["by", "x"].includes(lower(tokens[j + 1]));
    if (startsSize) break;

    if (isDigits(w)) {
      if (last !== null && last !== "mult" && last !== "and") break;
      if (last !== null && Number(w) >= 1000) break;
      current += Number(w);
      last = "digit";
      any = true;
      continue;
    }

    const word = WORDS[w];
    if (word) {
      if (AMBIGUOUS.has(w) && last === null && !ambiguousIsNumber(tokens, j)) break;
      if (last === null || last === "mult" || last === "and") {
        current += word.value;
      } else if (last === "tens" && word.kind === "unit" && word.value > 0) {
        current += word.value;
      } else {
        break;
      }
      last = word.kind;
      any = true;
      continue;
    }

    const mult = MULTIPLIERS[w];
    if (mult !== undefined) {
      if (mult === 100) {
        if (last === "mult" && current % 100 === 0 && current !== 0) break;
        current = (current || 1) * 100;
      } else {
        total += (current || 1) * mult;
        current = 0;
      }
      last = "mult";
      any = true;
      continue;
    }

    if (w === "and" && last === "mult" && startsNumber(tokens[j + 1])) {
      last = "and";
      continue;
    }

    // "aath point paanch" -> 8.5
    if (w === "point" && any && (last === "unit" || last === "digit" || last === "teen" || last === "tens" || last === "whole")) {
      const digits: string[] = [];
      let k = j + 1;
      for (; k < tokens.length; k++) {
        const d = WORDS[lower(tokens[k])];
        const dw = lower(tokens[k]);
        if (d && d.kind === "unit") digits.push(String(d.value));
        else if (/^\d$/.test(dw)) digits.push(dw);
        else break;
      }
      if (digits.length > 0) {
        current = Number(`${total + current}.${digits.join("")}`);
        total = 0;
        j = k;
      }
      break;
    }

    break;
  }

  if (!any) return null;
  if (last === "and") j -= 1;
  return { value: total + current + adjust, end: j };
}

/** Replaces every spoken number phrase in a token list with its digits. */
export function convertNumberWords(tokens: readonly string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const found = readNumber(tokens, i);
    if (found && found.end > i) {
      const span = found.end - i;
      // A lone digit token stays exactly as it was typed.
      out.push(span === 1 && isDigits(tokens[i] ?? "") ? (tokens[i] ?? "") : format(found.value));
      i = found.end;
    } else {
      out.push(tokens[i] ?? "");
      i += 1;
    }
  }
  return out;
}
