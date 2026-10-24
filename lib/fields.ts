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
}

export const FIELDS = [
  // Customer
  { key: "company", group: "customer", label: "Company", kind: "text", aliases: ["company", "party", "firm", "client"], requiredAt: "card", onCustomer: true, onPdf: false },
  { key: "contactPerson", group: "customer", label: "Contact person", kind: "text", aliases: ["contact", "naam", "person", "ji", "sahab"], requiredAt: null, onCustomer: true, onPdf: false },
  { key: "phone", group: "customer", label: "Phone", kind: "phone", aliases: ["phone", "mobile", "number", "contact number"], requiredAt: null, onCustomer: true, onPdf: false },
  { key: "gstin", group: "customer", label: "GST number", kind: "gstin", aliases: ["gst number", "gstin", "gst no"], requiredAt: null, onCustomer: true, onPdf: false, hint: "A 15-character GSTIN, not a GST percentage." },
  { key: "address", group: "customer", label: "Address", kind: "text", aliases: ["address", "pata", "delivery address", "location"], requiredAt: "card", onCustomer: true, onPdf: false },

  // Box
  { key: "length", group: "box", label: "Length", kind: "length", aliases: ["length", "lambai", "L"], requiredAt: "card", onPdf: true, hint: "In 'A by B by C' the first number is length." },
  { key: "breadth", group: "box", label: "Breadth", kind: "length", aliases: ["breadth", "width", "chaudai", "W"], requiredAt: "card", onPdf: true, hint: "In 'A by B by C' the second number is breadth." },
  { key: "height", group: "box", label: "Height", kind: "length", aliases: ["height", "unchai", "depth", "H"], requiredAt: "card", onPdf: true, hint: "In 'A by B by C' the third number is height." },
  { key: "dimUnit", group: "box", label: "Size unit", kind: "enum", options: ["mm", "cm", "inch"], aliases: ["inch", "inches", "suta", "cm", "centimetre", "mm", "millimetre"], requiredAt: "card", onPdf: false },
  { key: "style", group: "box", label: "Box style", kind: "enum", options: ["RSC", "Die-cut", "HSC", "FOL", "Telescopic", "Tray"], aliases: ["style", "type", "RSC", "regular slotted", "die cut", "die-cut", "half slotted", "full overlap", "telescopic", "tray"], requiredAt: "card", onPdf: true },
  { key: "sizeType", group: "box", label: "Inner / outer size", kind: "enum", options: ["Inner", "Outer"], aliases: ["inner", "andar", "inside", "outer", "bahar", "outside"], requiredAt: null, onPdf: true },

  // Strength
  { key: "ply", group: "strength", label: "Ply", kind: "int", options: ["3", "5", "7"], aliases: ["ply", "parat", "layer"], requiredAt: "card", onPdf: true },
  { key: "flute", group: "strength", label: "Flute", kind: "enum", options: ["A", "B", "C", "E", "F", "BC", "BE", "CC"], aliases: ["flute", "fluting"], requiredAt: "card", onPdf: true },
  { key: "gsm", group: "strength", label: "GSM", kind: "int", aliases: ["gsm", "grammage"], requiredAt: null, onPdf: true },
  { key: "bf", group: "strength", label: "BF", kind: "int", aliases: ["bf", "bursting factor"], requiredAt: null, onPdf: true },
  { key: "burstingStrength", group: "strength", label: "Bursting strength (kg/cm²)", kind: "int", aliases: ["bursting strength", "bs", "burst"], requiredAt: null, onPdf: true },
  { key: "loadKg", group: "strength", label: "Load", kind: "kg", aliases: ["load", "weight", "wazan", "kilo", "kg", "bhar"], requiredAt: "card", onPdf: true, hint: "How much weight the box must carry, in kg." },
  { key: "stacking", group: "strength", label: "Stacking (boxes high)", kind: "int", aliases: ["stacking", "stack", "upar upar", "tier"], requiredAt: null, onPdf: true },

  // Extras
  { key: "printColours", group: "extras", label: "Printing (colours)", kind: "int", aliases: ["print", "printing", "colour", "color", "rang", "plain"], requiredAt: "card", onPdf: true, hint: "'plain' or 'no print' means 0." },
  { key: "joint", group: "extras", label: "Joint", kind: "enum", options: ["Stitched", "Glued", "Taped"], aliases: ["joint", "stitch", "stitching", "pin", "glue", "gum", "pasting", "tape"], requiredAt: "card", onPdf: true },
  { key: "coating", group: "extras", label: "Coating", kind: "enum", options: ["None", "Lamination", "Varnish", "Wax"], aliases: ["coating", "lamination", "varnish", "wax", "polish"], requiredAt: null, onPdf: true },
  { key: "partitions", group: "extras", label: "Partitions", kind: "text", aliases: ["partition", "partitions", "khana", "divider"], requiredAt: null, onPdf: true },

  // Commercial
  { key: "quantity", group: "commercial", label: "Quantity", kind: "int", aliases: ["quantity", "qty", "box", "boxes", "piece", "nag", "pcs"], requiredAt: "card", onPdf: true },
  { key: "ratePerBox", group: "commercial", label: "Rate per box", kind: "money", aliases: ["rate", "bhav", "price", "per box", "ka"], requiredAt: "quote", ownerOnly: true, onPdf: true },
  { key: "gstPercent", group: "commercial", label: "GST %", kind: "percent", aliases: ["gst", "tax"], requiredAt: "quote", onPdf: true, hint: "A percentage such as 5, 12 or 18, not a GST number." },
  { key: "deliveryTime", group: "commercial", label: "Delivery time", kind: "text", aliases: ["delivery", "dispatch", "din mein", "days"], requiredAt: "quote", onPdf: true },
  { key: "paymentTerms", group: "commercial", label: "Payment terms", kind: "text", aliases: ["payment", "advance", "credit", "udhaar"], requiredAt: "quote", onPdf: true },
  { key: "validity", group: "commercial", label: "Quote valid for", kind: "text", aliases: ["validity", "valid", "valid till"], requiredAt: "quote", onPdf: true },
] as const satisfies readonly FieldDef[];

export type FieldKey = (typeof FIELDS)[number]["key"];

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

/** Request stages, in board order. */
export const STAGES = ["New", "Quoted", "Sent", "Won", "Lost"] as const;
export type Stage = (typeof STAGES)[number];

/** A stored field value: string, number, or empty. */
export type SpecValue = string | number | null;
export type Specs = Partial<Record<FieldKey, SpecValue>>;

/** Fields that are flagged missing at the given point, given what the card already has. */
export function missingFields(specs: Specs, at: "card" | "quote"): FieldKey[] {
  return FIELDS.filter((f) => {
    if (f.requiredAt === null) return false;
    if (at === "card" && f.requiredAt !== "card") return false;
    const v = specs[f.key];
    return v === undefined || v === null || v === "";
  }).map((f) => f.key);
}
