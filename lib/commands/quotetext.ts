/**
 * Things that live only on the quotation, said in plain words: the notes, and
 * your own letterhead (company name, email, GSTIN, phone, address). Read by
 * code, not the LLM: each value is copied word for word from what was
 * dictated. Pure.
 */

export const SELLER_KEYS = ["name", "email", "gstin", "phone", "address"] as const;
export type SellerKey = (typeof SELLER_KEYS)[number];
export type SellerWords = Partial<Record<SellerKey, string>>;

export interface QuoteText {
  notes?: string;
  seller?: SellerWords;
}

export const SELLER_LABEL: Record<SellerKey, string> = {
  name: "Your company name",
  email: "Your email",
  gstin: "Your GSTIN",
  phone: "Your phone",
  address: "Your address",
};

const NOTES: RegExp[] = [
  // "notes mein ex works Bhiwandi likho"
  /^notes? (?:mein|me|main)\s+(.+?)\s+(?:likho|likh do|daalo|daal do|add karo)$/i,
  // "notes mein likho ex works Bhiwandi", "note: ex works", "add note ex works", "write in notes ex works"
  /^(?:add (?:a )?notes?|write in (?:the )?notes|notes? (?:mein|me|main) (?:likho|likh do|daalo|daal do|add karo)|notes?(?: (?:is|should be|hai))?)\s*[:,\-–]?\s+(.+)$/i,
];

/** "my / our / hamari …": the owner is talking about his own company, not a customer's. */
const MINE = /\b(?:my|our|hamari|humari|hamara|humara|meri|mera|apni|apna)\b/i;
const OWNER = String.raw`(?:(?:my|our|hamari|humari|hamara|humara|meri|mera|apni|apna)\s+)?`;
const LINK = String.raw`(?:\s*(?:\bis\b|\bto\b|should be|\bhai\b|=|:|-))?\s*`;

/** Where each detail starts in the sentence; its value runs to the next one. */
const MARKERS: [SellerKey, RegExp][] = [
  ["name", new RegExp(String.raw`(?:(?:change|set|make)\s+)?${OWNER}\bcompany(?:'s)?\s+(?:ka\s+)?(?:name|naam)\b${LINK}`, "gi")],
  ["email", new RegExp(String.raw`${OWNER}\be-?mail\b(?:\s+(?:id|address))?${LINK}`, "gi")],
  ["gstin", new RegExp(String.raw`${OWNER}\b(?:gstin|gst\s*(?:in|no\.?|number))(?![a-z])${LINK}`, "gi")],
  ["phone", new RegExp(String.raw`${OWNER}\b(?:phone|mobile|contact)\b(?:\s+(?:number|no\.?))?${LINK}`, "gi")],
  ["address", new RegExp(String.raw`${OWNER}\b(?:address|pata)\b${LINK}`, "gi")],
];

/** Joining words and Hindi verbs left at the end of a value ("XYZ karo aur"). */
const TAIL = /(?:[\s,;]+|\s*\.\s*|\s+(?:and|aur|&|karo|kar do|kardo|kar diya|kar dijiye|karna hai|rakho|rakh do|hai|hain|please)\b)+$/i;

function clean(s: string): string {
  let v = s.trim();
  for (let prev = ""; prev !== v; ) {
    prev = v;
    v = v.replace(TAIL, "").replace(/^["“'‘]+|["”'’]+$/g, "").trim();
  }
  return v;
}

function readNotes(text: string): string | undefined {
  for (const p of NOTES) {
    const m = p.exec(text);
    const v = m?.[1] ? clean(m[1]) : "";
    if (v) return v;
  }
  return undefined;
}

/** On the Your company page, "name" alone means your company's name. */
const OWN_NAME: [SellerKey, RegExp] = ["name", new RegExp(String.raw`\b(?:name|naam)\b${LINK}`, "gi")];

function readSeller(text: string, own: boolean): SellerWords | null {
  if (!own && !MINE.test(text)) return null;
  const found: { key: SellerKey; start: number; end: number }[] = [];
  for (const [key, re] of own ? [...MARKERS, OWN_NAME] : MARKERS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) found.push({ key, start: m.index, end: m.index + m[0].length });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  // Drop a label inside another ("address" in "email address").
  const labels = found.filter((f, i) => !found.slice(0, i).some((g) => f.start < g.end));
  // The sentence must be about the letterhead from its first words, or "Sharma ka email … aur my GSTIN …" would slip in.
  if (!labels[0] || (!own && labels[0].start > 25)) return null;
  const out: SellerWords = {};
  labels.forEach((f, i) => {
    const value = clean(text.slice(f.end, labels[i + 1]?.start ?? text.length));
    if (value) out[f.key] = value; // last one said wins
  });
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Notes or your letterhead details, if that is what the sentence says; otherwise null (the LLM reads it).
 * With ownCompany (the Your company page) every detail said is yours, with or without "my / our".
 */
export function readQuoteText(raw: string, opts: { ownCompany?: boolean } = {}): QuoteText | null {
  const text = raw.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  const seller = readSeller(text, opts.ownCompany === true);
  if (seller) return { seller };
  const notes = readNotes(text);
  if (notes) return notes.length <= 2000 ? { notes } : null;
  return null;
}
