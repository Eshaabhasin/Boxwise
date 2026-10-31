/**
 * THE FIELD LIST. Edit this file after checking the notebook.
 *
 * Every card field, its spoken aliases, allowed values and whether it is
 * flagged as missing all come from here. The LLM prompt, the zod schemas,
 * the card screen, the missing-field flags and the PDF spec table are all
 * built from this list, so adding or removing a field here is enough.
 *
 * How values are stored (code converts; the LLM never does maths):
 *   text     plain string
 *   phone    10-digit string
 *   gstin    15-character GSTIN, upper case
 *   int      whole number (quantity, GSM, colours...)
 *   length   millimetres (the spoken unit is kept in `dimUnit`)
 *   kg       kilograms
 *   money    integer paise (Rs 12.50 is stored as 1250)
 *   percent  number, e.g. 18 for 18%
 *   enum     one of `options`
 */

export const FIELD_GROUPS = [
  { key: "customer", label: "Customer" },
  { key: "box", label: "Box" },
  { key: "strength", label: "Strength" },
  { key: "extras", label: "Extras" },
  { key: "commercial", label: "Commercial" },
] as const;

export type FieldGroup = (typeof FIELD_GROUPS)[number]["key"];

export type FieldKind =
  | "text"
  | "phone"
  | "gstin"
  | "int"
  | "length"
  | "kg"
  | "money"
  | "percent"
  | "enum";

/**
 * When a field is flagged as missing:
 *   "card"  as soon as the request card exists (he should ask the customer)
 *   "quote" only once he starts the quotation (rate and terms)
 *   null    never flagged
 */
export type RequiredAt = "card" | "quote" | null;

export interface FieldDef {
  key: string;
  group: FieldGroup;
  label: string;
  kind: FieldKind;
  /** Allowed values for kind "enum", in the exact spelling shown on the card and PDF. */
  options?: readonly string[];
  /**
   * For enums: what he says for each option. The guard only keeps an option if
   * one of these words (or the option itself) is in the dictated text.
   */
  optionAliases?: Readonly<Record<string, readonly string[]>>;
  /** For numbers: words that justify a value that is not written as a digit ("plain" = 0 colours). */
  impliedNumbers?: Readonly<Record<number, readonly string[]>>;
  /** Words he may say for this field, including Hinglish. Fed to the LLM prompt. */
  aliases: readonly string[];
  requiredAt: RequiredAt;
  /** Stored on the customer record instead of the request card. */
  onCustomer?: boolean;
  /** Only the owner's own spoken "set rate" command may fill this. Never inferred. */
  ownerOnly?: boolean;
  /** Shown on the PDF spec table. */
  onPdf: boolean;
  /** Extra hint for the LLM when the field is easy to confuse. */
  hint?: string;
  /** Only asked for these box types (e.g. ply is never asked for an inner carton). */
  onlyFor?: readonly string[];
  /** Counts as said when this other field is said ("2 colour print" answers plain / multi-colour). */
  answeredBy?: string;
  /** Kept by code, never read from speech or shown as a field. */
  internal?: boolean;
  /**
   * For enums said in many ways: when one of these words was said, the LLM's choice of option
   * is kept even if none of the option's own phrases were (the plan shows it before "approve").
   */
  topic?: readonly string[];
  /**
   * For choices: keep GPT's reading even when none of the option's words were said
   * ("regular shipper type thing" = Carton); the plan asks him to check it. Numbers are never trusted this way.
   */
  trustReading?: boolean;
}

/** The kinds of box Boxwise prices, each with its own sheet formula. */
export const BOX_TYPES = ["Carton", "Self-lock", "Inner carton"] as const;
export type BoxType = (typeof BOX_TYPES)[number];

/** "B flute", "flute B", "B-flute"... for each flute letter. */
function fluteAliases(letters: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(
    letters.map((l) => {
      const x = l.toLowerCase();
      return [l, [`${x} flute`, `flute ${x}`, `${x}-flute`, `${x} fluting`, `${x} type flute`]];
    }),
  );
}

export const FIELDS = [
  // Customer
  { key: "company", group: "customer", label: "Company", kind: "text", aliases: ["party", "firm"], requiredAt: "card", onCustomer: true, onPdf: false },
  { key: "contactPerson", group: "customer", label: "Contact person", kind: "text", aliases: ["contact", "naam", "ji"], requiredAt: null, onCustomer: true, onPdf: false },
  { key: "phone", group: "customer", label: "Phone", kind: "phone", aliases: ["phone", "mobile"], requiredAt: null, onCustomer: true, onPdf: false },
  { key: "gstin", group: "customer", label: "GST number", kind: "gstin", aliases: ["gst number", "gstin", "gst no"], requiredAt: null, onCustomer: true, onPdf: false, hint: "A 15-character GSTIN, not a GST percentage." },
  { key: "address", group: "customer", label: "Address", kind: "text", aliases: ["address", "pata", "delivery address", "location"], requiredAt: null, onCustomer: true, onPdf: false },

  // Box
  { key: "boxType", group: "box", label: "Box type", kind: "enum", options: BOX_TYPES, optionAliases: { Carton: ["carton", "carton box", "normal box", "regular box", "rsc"], "Self-lock": ["self lock", "self-lock", "selflock", "lock box", "mailer", "pizza box"], "Inner carton": ["inner carton", "mono carton", "inner box", "duplex box", "sbs box"] }, aliases: ["mailer", "mono carton"], requiredAt: "card", onPdf: true, hint: "'inner carton' is this, not sizeType.", trustReading: true },
  { key: "length", group: "box", label: "Length", kind: "length", aliases: ["length", "lambai", "L"], requiredAt: "card", onPdf: true, hint: "In 'A by B by C' the first number is length." },
  { key: "breadth", group: "box", label: "Breadth", kind: "length", aliases: ["breadth", "width", "chaudai", "W"], requiredAt: "card", onPdf: true, hint: "In 'A by B by C' the second number is breadth." },
  { key: "height", group: "box", label: "Height", kind: "length", aliases: ["height", "unchai", "depth", "H"], requiredAt: "card", onPdf: true, hint: "In 'A by B by C' the third number is height." },
  { key: "dimUnit", group: "box", label: "Size unit", kind: "enum", options: ["mm", "cm", "inch"], optionAliases: { mm: ["mm", "millimetre", "millimeter", "mili"], cm: ["cm", "centimetre", "centimeter", "sentimeter"], inch: ["inch", "inches", "in", "inchi"] }, aliases: [], requiredAt: "card", onPdf: false },
  { key: "style", group: "box", label: "Box style", kind: "enum", options: ["RSC", "Die-cut", "HSC", "FOL", "Telescopic", "Tray"], optionAliases: { RSC: ["rsc", "regular slotted", "regular box"], "Die-cut": ["die cut", "die-cut", "diecut", "dye cut"], HSC: ["hsc", "half slotted"], FOL: ["fol", "full overlap"], Telescopic: ["telescopic", "top bottom", "top and bottom"], Tray: ["tray"] }, aliases: ["style"], requiredAt: null, onPdf: true },
  { key: "colour", group: "box", label: "Colour", kind: "enum", options: ["Brown", "White"], optionAliases: { Brown: ["brown", "bhura", "kraft", "natural"], White: ["white", "safed", "sufed"] }, aliases: ["safed", "kraft"], requiredAt: "card", onPdf: true, onlyFor: ["Carton", "Self-lock"], hint: "Outer paper, not print.", trustReading: true },
  { key: "board", group: "box", label: "Board", kind: "enum", options: ["Duplex", "SBS"], optionAliases: { Duplex: ["duplex"], SBS: ["sbs", "solid bleached"] }, aliases: [], requiredAt: null, onPdf: true, onlyFor: ["Inner carton"], trustReading: true },
  { key: "sizeType", group: "box", label: "Inner / outer size", kind: "enum", options: ["Inner", "Outer"], optionAliases: { Inner: ["inner", "andar", "inside", "internal", "id"], Outer: ["outer", "bahar", "outside", "external", "od"] }, aliases: ["andar ka size", "bahar ka size"], requiredAt: null, onPdf: true },

  // Strength
  { key: "ply", group: "strength", label: "Ply", kind: "int", options: ["3", "5", "7"], aliases: ["ply", "parat", "layer"], requiredAt: "card", onPdf: true, onlyFor: ["Carton", "Self-lock"] },
  { key: "flute", group: "strength", label: "Flute", kind: "enum", options: ["A", "B", "C", "E", "F", "BC", "BE", "CC"], optionAliases: fluteAliases(["A", "B", "C", "E", "F", "BC", "BE", "CC"]), aliases: ["flute", "fluting"], requiredAt: null, onPdf: true, hint: "Only a flute letter the speaker said next to the word flute." },
  { key: "gsm", group: "strength", label: "GSM", kind: "int", aliases: ["gsm", "grammage"], requiredAt: null, onPdf: true },
  { key: "bf", group: "strength", label: "BF", kind: "int", aliases: ["bf", "bursting factor"], requiredAt: null, onPdf: true },
  { key: "burstingStrength", group: "strength", label: "Bursting strength (kg/cm²)", kind: "int", aliases: ["bursting strength", "bs", "burst"], requiredAt: null, onPdf: true },
  { key: "loadKg", group: "strength", label: "Load", kind: "kg", aliases: ["load", "wazan", "kilo", "bhar"], requiredAt: null, onPdf: true, hint: "How much weight the box must carry, in kg." },
  { key: "stacking", group: "strength", label: "Stacking (boxes high)", kind: "int", aliases: ["stack", "upar upar"], requiredAt: null, onPdf: true },

  // Extras
  { key: "print", group: "extras", label: "Print", kind: "enum", options: ["Plain", "Multi-colour"], optionAliases: { Plain: ["plain", "no print", "without print", "bina print", "print nahi", "printing nahi", "no printing"], "Multi-colour": ["multicolour", "multicolor", "multi colour", "multi color", "multi-colour", "multi-color", "coloured", "colored", "printed", "colour print", "color print", "colour printing", "color printing", "rangeen"] }, aliases: ["printing", "coloured"], requiredAt: "card", answeredBy: "printColours", onPdf: true, trustReading: true },
  { key: "printColours", group: "extras", label: "Printing (colours)", kind: "int", impliedNumbers: { 0: ["plain", "no print", "without print", "bina print", "print nahi", "printing nahi", "no printing"], 1: ["single colour", "single color", "one colour", "one color"] }, aliases: ["2 colour", "rang"], requiredAt: null, onPdf: true, hint: "'plain' is 0." },
  { key: "joint", group: "extras", label: "Joint", kind: "enum", options: ["Stitched", "Glued", "Taped"], optionAliases: { Stitched: ["stitch", "stitched", "stitching", "pin", "pinning", "staple", "stapled"], Glued: ["glue", "glued", "gluing", "gum", "pasting", "paste", "pasted"], Taped: ["tape", "taped"] }, aliases: ["joint", "jod"], requiredAt: null, onPdf: true },
  { key: "coating", group: "extras", label: "Lamination / coating", kind: "enum", options: ["None", "Lamination", "Varnish", "Wax"], optionAliases: { None: ["no coating", "without coating", "coating nahi", "bina coating", "no lamination", "without lamination", "lamination nahi", "bina lamination", "non laminated", "unlaminated", "not laminated"], Lamination: ["lamination", "laminated", "laminate"], Varnish: ["varnish", "varnished"], Wax: ["wax", "waxed"] }, aliases: ["lamination", "coating"], requiredAt: "card", onPdf: true, hint: "'no lamination' = None.", trustReading: true },
  { key: "artwork", group: "extras", label: "Design", kind: "enum", options: ["Customer's", "We design", "Existing"], optionAliases: { "Customer's": ["their design", "customer design", "party design", "design provided", "design dega", "design denge", "apna design", "artwork provided", "they will give", "design they", "will give the design", "own design", "design not needed", "no design needed", "design not required"], "We design": ["we design", "we will design", "design banana", "design bana", "design hum", "make the design", "design karna"], Existing: ["same design", "old design", "purana design", "existing design", "design already"] }, aliases: ["design", "artwork"], requiredAt: null, onPdf: false, topic: ["design", "artwork"], hint: "We design = we make it.", trustReading: true },
  { key: "cutting", group: "extras", label: "Cutting", kind: "enum", options: ["Die", "Existing die", "Slitter"], optionAliases: { Die: ["die", "die cut", "die cutting", "dye"], "Existing die": ["same die", "old die", "purani die", "die already", "existing die", "die hai"], Slitter: ["slitter", "slitting", "no die", "bina die"] }, aliases: [], requiredAt: null, onPdf: false, topic: ["die", "slitter", "slitting", "cutting"], hint: "old die = Existing die.", trustReading: true },
  { key: "partitions", group: "extras", label: "Partitions", kind: "text", aliases: ["partition", "khana"], requiredAt: null, onPdf: true },

  // Commercial
  { key: "quantity", group: "commercial", label: "Quantity", kind: "int", aliases: ["quantity", "qty", "box", "boxes", "piece", "nag", "pcs"], requiredAt: "card", onPdf: true },
  { key: "ratePerBox", group: "commercial", label: "Rate per box", kind: "money", aliases: ["rate", "bhav", "price"], requiredAt: "quote", ownerOnly: true, onPdf: true },
  { key: "dieCharge", group: "commercial", label: "Die charge (one-time)", kind: "money", aliases: ["die charge"], requiredAt: null, ownerOnly: true, onPdf: false },
  { key: "designCharge", group: "commercial", label: "Design charge (one-time)", kind: "money", aliases: ["design charge"], requiredAt: null, ownerOnly: true, onPdf: false },
  { key: "ownerSet", group: "commercial", label: "Set by you", kind: "text", aliases: [], requiredAt: null, onPdf: false, internal: true },
  { key: "gstPercent", group: "commercial", label: "GST %", kind: "percent", aliases: ["gst", "tax"], requiredAt: "quote", onPdf: true, hint: "A percentage such as 5, 12 or 18, not a GST number." },
  { key: "deliveryTime", group: "commercial", label: "Delivery time", kind: "text", aliases: ["delivery", "dispatch"], requiredAt: "quote", onPdf: true },
  { key: "paymentTerms", group: "commercial", label: "Payment terms", kind: "text", aliases: ["payment", "advance", "credit", "udhaar"], requiredAt: "quote", onPdf: true },
  { key: "validity", group: "commercial", label: "Quote valid for", kind: "text", aliases: ["validity", "valid", "valid till"], requiredAt: "quote", onPdf: true },
] as const satisfies readonly FieldDef[];

export type FieldKey = (typeof FIELDS)[number]["key"];

/** Fields read from speech and shown on screen (not the ones code keeps for itself). */
export const SPOKEN_FIELD_DEFS: readonly FieldDef[] = (FIELDS as readonly FieldDef[]).filter((f) => !f.internal);

/** The same list, typed loosely so optional properties can be read on any field. */
export const FIELD_DEFS: readonly FieldDef[] = FIELDS;

export const FIELD_KEYS = FIELDS.map((f) => f.key) as readonly FieldKey[];

const FIELD_MAP: ReadonlyMap<string, FieldDef> = new Map(FIELDS.map((f) => [f.key, f]));

export function getField(key: string): FieldDef | undefined {
  return FIELD_MAP.get(key);
}

export function isFieldKey(key: string): key is FieldKey {
  return FIELD_MAP.has(key);
}

export const CUSTOMER_FIELD_KEYS = FIELDS.filter((f) => "onCustomer" in f && f.onCustomer).map(
  (f) => f.key,
) as readonly FieldKey[];

/**
 * Where a field lives:
 *   customer  on the customer record (shared by all their enquiries)
 *   item      on each box of an enquiry (an enquiry can have many boxes)
 *   quote     once per quotation (GST and terms)
 */
export type FieldScope = "customer" | "item" | "quote";

export function scopeOf(f: FieldDef): FieldScope {
  if (f.onCustomer) return "customer";
  if (f.requiredAt === "quote" && !f.ownerOnly) return "quote";
  return "item";
}

export const ITEM_FIELD_KEYS = FIELD_DEFS.filter((f) => scopeOf(f) === "item").map((f) => f.key) as readonly FieldKey[];
export const QUOTE_FIELD_KEYS = FIELD_DEFS.filter((f) => scopeOf(f) === "quote").map((f) => f.key) as readonly FieldKey[];

/** Splits a mixed set of values into customer, per-box and quotation-level parts. */
export function splitByScope(values: Partial<Record<FieldKey, SpecValue>>): Record<FieldScope, Specs> {
  const out: Record<FieldScope, Specs> = { customer: {}, item: {}, quote: {} };
  for (const [k, v] of Object.entries(values) as [FieldKey, SpecValue][]) {
    const f = getField(k);
    if (f && v !== undefined) out[scopeOf(f)][k] = v;
  }
  return out;
}

/** Request stages, in board order. */
export const STAGES = ["New", "Quoted", "Sent", "Won", "Lost"] as const;
export type Stage = (typeof STAGES)[number];

/** A stored field value: string, number, or empty. */
export type SpecValue = string | number | null;
export type Specs = Partial<Record<FieldKey, SpecValue>>;

function said(v: SpecValue | undefined): boolean {
  return v !== undefined && v !== null && v !== "";
}

/** Fields that are flagged missing at the given point, given what the card already has. */
export function missingFields(specs: Specs, at: "card" | "quote"): FieldKey[] {
  const type = typeof specs.boxType === "string" ? specs.boxType : null;
  return FIELD_DEFS.filter((f) => {
    if (f.requiredAt === null) return false;
    if (at === "card" && f.requiredAt !== "card") return false;
    if (f.onlyFor && type && !f.onlyFor.includes(type)) return false;
    if (f.answeredBy && said(specs[f.answeredBy as FieldKey])) return false;
    return !said(specs[f.key as FieldKey]);
  }).map((f) => f.key as FieldKey);
}
