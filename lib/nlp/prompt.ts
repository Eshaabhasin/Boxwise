import { FIELD_DEFS, type FieldDef } from "@/lib/fields";
import type { ChatMessage } from "@/lib/nlp/llm";

/**
 * The command-reading prompt. The field list is built from lib/fields.ts, so
 * editing that file updates the prompt. Examples raise accuracy more than
 * longer instructions, so most of this is few-shot examples.
 * The text the LLM sees is already normalized: numbers are digits.
 * Each message carries the screen it was spoken on, so "height 9 inch kar do"
 * on a card means that card.
 */

function describe(f: FieldDef): string {
  const parts = [`- ${f.key} (${f.label}): `];
  switch (f.kind) {
    case "enum":
      parts.push(`one of ${(f.options ?? []).map((o) => JSON.stringify(o)).join(", ")}`);
      break;
    case "length":
      parts.push("number, in the unit spoken (do not convert)");
      break;
    case "kg":
      parts.push("number of kg");
      break;
    case "int":
      parts.push(f.options ? `whole number, one of ${f.options.join(", ")}` : "whole number");
      break;
    case "percent":
      parts.push("number (percent)");
      break;
    case "phone":
      parts.push("phone number as digits");
      break;
    case "gstin":
      parts.push("15-character GSTIN exactly as said");
      break;
    case "money":
      parts.push("rupees per box as a number, exactly as the owner said it. ONLY for intent set_rate");
      break;
    default:
      parts.push("text, as said");
  }
  if (f.aliases.length) parts.push(`. Said as: ${f.aliases.join(", ")}`);
  if (f.hint) parts.push(`. ${f.hint}`);
  return parts.join("");
}

export function systemPrompt(): string {
  const fields = FIELD_DEFS.map(describe).join("\n");
  return `You read commands that the owner of a corrugated box factory in India dictates by voice into his quotation app, and return JSON.
The text comes from speech: no punctuation, run-on sentences, Hindi words mixed with English (Hinglish). Numbers are already digits.
Each message starts with the screen he is on, then what he said.

Return ONLY this JSON object:
{"intent": ..., "target": string|null, "stage": string|null, "query": string|null, "filter": string|null, "fields": { <field key>: <value> }, "unclear": [<short notes>]}

Intents:
- "create_request": a new box request from a customer (a company and box details).
- "edit_request": change details of a card that already exists ("height 9 inch kar do", "quantity 800 karo", "Sharma ka address Bhiwandi daal do"). fields = only the changed fields.
- "set_rate": the owner gives his rate and/or terms for a card ("rate 18 rupees per box GST 18 percent", "delivery 10 days payment 50 percent advance", "rate 17 karo"). fields = ratePerBox, gstPercent, deliveryTime, paymentTerms, validity, and any other field he changes in the same breath.
- "search": find or list cards ("Sharma dhundo", "pending dikhao", "won wale dikhao"). query = company words or null; filter = "Pending", "New", "Quoted", "Sent", "Won", "Lost" or "All", or null.
- "open": open one card ("Sharma ka card kholo", "REQ 3 kholo").
- "set_stage": the order was won or lost, or a card goes back to new ("order mil gaya" = "Won", "mana kar diya" / "order nahi mila" = "Lost"). stage = "Won", "Lost" or "New".
- "other": anything else.

target: for edit_request, set_rate, open and set_stage, the company name or "REQ <number>" exactly as said; null if he did not name one (he means the card on screen). Always null for create_request.

Rules:
1. Include a field ONLY if the speaker said it. Never guess, never add a default, never fill a value that was not said. Leave unsaid fields out completely.
2. Copy numbers exactly as said. Do no maths and no unit conversion. For a size give the sides in the spoken unit and put that unit in dimUnit (only if a unit was said).
3. "A by B by C" means length A, breadth B, height C.
4. When the speaker corrects himself ("500 nahi 600", "500 sorry 600", "500 I mean 600", "500 matlab 600", "nahi nahi 45"), keep ONLY the last value.
5. ratePerBox is ONLY for intent set_rate, when the owner states his own rate. Never suggest, estimate or calculate a rate. In any other intent leave a mentioned rate out and add a note to "unclear".
6. company is the customer's company name as said, with normal capitalisation. Words around it like "ke liye", "ka", "se", "ki taraf se", "naya order" are not part of the name. In an edit, a company name that only says which card goes in target, not in fields.
7. If the text has "Earlier:" and "Correction:", start from the earlier command and apply the correction: corrected values replace earlier ones, new values are added, everything else stays. Return the full result with the same intent.
8. "unclear" lists things that were said but do not fit. Keep it empty otherwise.
9. Terms (deliveryTime, paymentTerms, validity) are short text in the speaker's own words ("10 days", "50 percent advance", "30 din credit", "15 din").

Fields:
${fields}`;
}

export type Screen = string;

/** [screen, dictated (already normalized), expected JSON] */
export const FEW_SHOTS: readonly [Screen, string, object][] = [
  [
    "new quote",
    "Sharma Packaging 500 box 12 by 10 by 8 inch 5 ply 30 kilo load 2 colour print",
    { intent: "create_request", fields: { company: "Sharma Packaging", quantity: 500, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2 } },
  ],
  [
    "new quote",
    "Verma Sweets ke liye 2000 box chahiye 10 by 8 by 4 inch 3 ply plain matlab no print stitched",
    { intent: "create_request", fields: { company: "Verma Sweets", quantity: 2000, length: 10, breadth: 8, height: 4, dimUnit: "inch", ply: 3, printColours: 0, joint: "Stitched" } },
  ],
  [
    "new quote",
    "Anand Electricals 300 boxes 450 by 300 by 250 mm 7 ply 40 kilo load nahi nahi 45 kilo glued",
    { intent: "create_request", fields: { company: "Anand Electricals", quantity: 300, length: 450, breadth: 300, height: 250, dimUnit: "mm", ply: 7, loadKg: 45, joint: "Glued" } },
  ],
  [
    "new quote",
    "Gupta Foods se Rakesh ji ka call tha 1000 box chahiye 14 by 10 by 6 inch 3 ply B flute 15 kilo load 1 colour print unka number 9876543210",
    { intent: "create_request", fields: { company: "Gupta Foods", contactPerson: "Rakesh", phone: "9876543210", quantity: 1000, length: 14, breadth: 10, height: 6, dimUnit: "inch", ply: 3, flute: "B", loadKg: 15, printColours: 1 } },
  ],
  [
    "board",
    "Mehta Plastics outer size 18 by 12 by 12 inch 7 ply BC flute die cut 250 pieces 40 kg load lamination chahiye",
    { intent: "create_request", fields: { company: "Mehta Plastics", sizeType: "Outer", length: 18, breadth: 12, height: 12, dimUnit: "inch", ply: 7, flute: "BC", style: "Die-cut", quantity: 250, loadKg: 40, coating: "Lamination" } },
  ],
  [
    "new quote",
    "Kapoor Textiles 600 by 400 by 400 cm sorry mm 5 ply 800 box",
    { intent: "create_request", fields: { company: "Kapoor Textiles", length: 600, breadth: 400, height: 400, dimUnit: "mm", ply: 5, quantity: 800 } },
  ],
  [
    "new quote",
    "Shree Ganesh Traders address plot 12 MIDC Bhiwandi GST number 27AAPFU0939F1ZV 5000 box 8 by 6 by 4 inch 3 ply RSC 2 colour print",
    { intent: "create_request", fields: { company: "Shree Ganesh Traders", address: "Plot 12, MIDC, Bhiwandi", gstin: "27AAPFU0939F1ZV", quantity: 5000, length: 8, breadth: 6, height: 4, dimUnit: "inch", ply: 3, style: "RSC", printColours: 2 } },
  ],
  [
    "new quote",
    "Jain Medicals 1500 box 9 by 7 by 5 inch 3 ply customer bol raha hai rate 12 rupees chalega",
    { intent: "create_request", fields: { company: "Jain Medicals", quantity: 1500, length: 9, breadth: 7, height: 5, dimUnit: "inch", ply: 3 }, unclear: ["customer mentioned a rate of 12 rupees; the rate is set separately"] },
  ],
  [
    "new quote",
    "Patel Agro andar ka size 300 by 200 by 150 mm 5 ply 150 gsm 18 bf bursting strength 12 6 khane ka partition 700 box",
    { intent: "create_request", fields: { company: "Patel Agro", sizeType: "Inner", length: 300, breadth: 200, height: 150, dimUnit: "mm", ply: 5, gsm: 150, bf: 18, burstingStrength: 12, partitions: "6 khane", quantity: 700 } },
  ],
  [
    "new quote",
    "naya order Singh Brothers ka 400 box",
    { intent: "create_request", fields: { company: "Singh Brothers", quantity: 400 } },
  ],
  [
    "new quote",
    "Earlier: Sharma Packaging 500 box 12 by 10 by 8 inch 5 ply 30 kilo load 2 colour print. Correction: nahi 600 box aur B flute",
    { intent: "create_request", fields: { company: "Sharma Packaging", quantity: 600, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2, flute: "B" } },
  ],
  [
    "card REQ-001 Sharma Packaging",
    "height 9 inch kar do",
    { intent: "edit_request", target: null, fields: { height: 9, dimUnit: "inch" } },
  ],
  [
    "card REQ-001 Sharma Packaging",
    "quantity 800 karo aur joint glued",
    { intent: "edit_request", target: null, fields: { quantity: 800, joint: "Glued" } },
  ],
  [
    "board",
    "Sharma Packaging ka address Bhiwandi godown daal do aur phone 9820012345",
    { intent: "edit_request", target: "Sharma Packaging", fields: { address: "Bhiwandi godown", phone: "9820012345" } },
  ],
  [
    "card REQ-002 Verma Sweets",
    "Earlier: height 5 inch kar do. Correction: nahi 6",
    { intent: "edit_request", target: null, fields: { height: 6, dimUnit: "inch" } },
  ],
  [
    "card REQ-001 Sharma Packaging",
    "rate 18 rupees per box GST 18 percent delivery 10 days payment 50 percent advance",
    { intent: "set_rate", target: null, fields: { ratePerBox: 18, gstPercent: 18, deliveryTime: "10 days", paymentTerms: "50 percent advance" } },
  ],
  [
    "card REQ-002 Verma Sweets",
    "12.5 rupaye ka rate lagao 12 percent GST aur validity 15 din",
    { intent: "set_rate", target: null, fields: { ratePerBox: 12.5, gstPercent: 12, validity: "15 din" } },
  ],
  [
    "board",
    "Gupta Foods ka rate 9 rupees 50 paise payment 30 din credit",
    { intent: "set_rate", target: "Gupta Foods", fields: { ratePerBox: 9.5, paymentTerms: "30 din credit" } },
  ],
  [
    "card REQ-001 Sharma Packaging",
    "Earlier: rate 18 rupees per box GST 18 percent. Correction: nahi rate 17",
    { intent: "set_rate", target: null, fields: { ratePerBox: 17, gstPercent: 18 } },
  ],
  [
    "card REQ-003 Mehta Plastics",
    "1000 box kar do aur rate 14",
    { intent: "set_rate", target: null, fields: { quantity: 1000, ratePerBox: 14 } },
  ],
  [
    "board",
    "Sharma dhundo",
    { intent: "search", query: "Sharma" },
  ],
  [
    "card REQ-003 Gupta Foods",
    "pending wale sab dikhao",
    { intent: "search", filter: "Pending" },
  ],
  [
    "board",
    "REQ 2 kholo",
    { intent: "open", target: "REQ 2" },
  ],
  [
    "new quote",
    "Sharma Packaging ka card dikhao",
    { intent: "open", target: "Sharma Packaging" },
  ],
  [
    "board",
    "Verma Sweets ka order mil gaya",
    { intent: "set_stage", target: "Verma Sweets", stage: "Won" },
  ],
  [
    "card REQ-004 Mehta Plastics",
    "ye order nahi mila customer ne mana kar diya",
    { intent: "set_stage", target: null, stage: "Lost" },
  ],
  [
    "board",
    "aaj kitne order aaye",
    { intent: "other" },
  ],
];

const BLANK = { target: null, stage: null, query: null, filter: null, fields: {}, unclear: [] };

function userMessage(screen: Screen, said: string): string {
  return `Screen: ${screen}\nSaid: ${said}`;
}

/** Builds the full chat: system prompt, the examples as past turns, then the new text. */
export function buildMessages(normalizedText: string, screen: Screen): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt() }];
  for (const [shotScreen, input, output] of FEW_SHOTS) {
    messages.push({ role: "user", content: userMessage(shotScreen, input) });
    messages.push({ role: "assistant", content: JSON.stringify({ ...BLANK, ...output }) });
  }
  messages.push({ role: "user", content: userMessage(screen, normalizedText) });
  return messages;
}

/** The text sent for a spoken correction to a plan that is still waiting. */
export function correctionText(earlier: string, correction: string): string {
  return `Earlier: ${earlier}. Correction: ${correction}`;
}
