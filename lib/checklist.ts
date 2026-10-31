/**
 * The checklist beside the New quote box: what to say, ticked as Wispr Flow
 * types it. Only a hint while speaking; the plan's "Not said" line is what
 * counts. Pure.
 */

export interface CheckItem {
  key: string;
  label: string;
  /** What to say, shown in grey. */
  say: string;
  optional?: boolean;
}

export const CHECKLIST: readonly CheckItem[] = [
  { key: "boxType", label: "Box type", say: "carton / self-lock / inner carton" },
  { key: "size", label: "Size L × B × H", say: "in inches" },
  { key: "ply", label: "Ply", say: "3 / 5 / 7" },
  { key: "colour", label: "Colour", say: "brown / white" },
  { key: "print", label: "Print", say: "plain / multi-colour" },
  { key: "lamination", label: "Lamination", say: "laminated / no lamination" },
  { key: "quantity", label: "Quantity", say: "e.g. 1000 piece" },
  { key: "design", label: "Design", say: "theirs / we design", optional: true },
  { key: "cutting", label: "Cutting", say: "die / slitter", optional: true },
];

const HEARD: Record<string, RegExp> = {
  boxType: /\b(carton|self[\s-]?lock|selflock|mailer|mono carton|inner box)\b/,
  size: /\d+(\.\d+)?\s*(by|x|×|\*)\s*\d+(\.\d+)?\s*(by|x|×|\*)\s*\d+/,
  ply: /\b[357]\s*-?\s*ply\b|\b(three|five|seven|teen|paanch|panch|saat)\s*-?\s*ply\b|\bply\s*(is|:|=|-|of)?\s*([357]|three|five|seven)\b/,
  colour: /\b(brown|white|safed|sufed|kraft|bhura)\b/,
  print: /\b(plain|multi[\s-]?colou?r(ed)?|colou?red|printed|\d+\s*-?\s*colou?r|single colou?r|no print|bina print|rangeen)\b/,
  lamination: /\b(lamination|laminated?|unlaminated|non[\s-]?laminated)\b/,
  quantity: /\b\d[\d,]*\s*(box|boxes|pcs|pc|pieces?|nag|carton|cartons)\b|\b(quantity|qty)\b/,
  design: /\bdesign\b|\bartwork\b/,
  cutting: /\b(die|slitter|slitting)\b/,
};

/** Which items the text so far mentions; ply and colour are not asked for an inner carton. */
export function checklistState(text: string): Record<string, "heard" | "todo" | "not needed"> {
  const t = text.toLowerCase();
  const inner = /\b(inner carton|mono carton|inner box)\b/.test(t);
  const out: Record<string, "heard" | "todo" | "not needed"> = {};
  for (const item of CHECKLIST) {
    if (inner && (item.key === "ply" || item.key === "colour")) out[item.key] = "not needed";
    else out[item.key] = HEARD[item.key]?.test(t) ? "heard" : "todo";
  }
  return out;
}

/** What GPT understood, in checklist terms: an item counts when every box has it. */
export interface Understood {
  keys: string[];
  /** All boxes are inner cartons: ply and colour are not asked. */
  inner: boolean;
}

const FROM_FIELDS: Record<string, readonly (readonly string[])[]> = {
  boxType: [["boxType"]],
  size: [["length", "breadth", "height"]],
  ply: [["ply"]],
  colour: [["colour"]],
  print: [["print"], ["printColours"]],
  lamination: [["coating"]],
  quantity: [["quantity"]],
  design: [["artwork"]],
  cutting: [["cutting"]],
};

function has(specs: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((k) => specs[k] !== undefined && specs[k] !== null && specs[k] !== "");
}

export function understoodFrom(boxes: readonly Record<string, unknown>[]): Understood {
  const keys = CHECKLIST.map((i) => i.key).filter(
    (key) => boxes.length > 0 && boxes.every((b) => (FROM_FIELDS[key] ?? []).some((alt) => has(b, alt))),
  );
  return { keys, inner: boxes.length > 0 && boxes.every((b) => b.boxType === "Inner carton") };
}

/** The checklist from what GPT understood (after "Read request"). */
export function checklistFromUnderstood(u: Understood): Record<string, "heard" | "todo" | "not needed"> {
  const out: Record<string, "heard" | "todo" | "not needed"> = {};
  for (const item of CHECKLIST) {
    if (u.inner && (item.key === "ply" || item.key === "colour")) out[item.key] = "not needed";
    else out[item.key] = u.keys.includes(item.key) ? "heard" : "todo";
  }
  return out;
}
