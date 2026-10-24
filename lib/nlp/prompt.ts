import { FIELD_DEFS, type FieldDef } from "@/lib/fields";
import type { ChatMessage } from "@/lib/nlp/llm";

/**
 * The request-parsing prompt. The field list is built from lib/fields.ts, so
 * editing that file updates the prompt. Examples raise accuracy more than
 * longer instructions, so most of this is few-shot examples.
 * The text the LLM sees is already normalized: numbers are digits.
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
      parts.push("NEVER fill this");
      break;
    default:
      parts.push("text, as said");
  }
  if (f.aliases.length) parts.push(`. Said as: ${f.aliases.join(", ")}`);
  if (f.hint) parts.push(`. ${f.hint}`);
  return parts.join("");
}

export function systemPrompt(): string {
  const fields = FIELD_DEFS.filter((f) => !f.ownerOnly).map(describe).join("\n");
  return `You read quotation requests that the owner of a corrugated box factory in India dictates by voice, and return JSON.
The text comes from speech: no punctuation, run-on sentences, Hindi words mixed with English (Hinglish). Numbers are already digits.

Return ONLY this JSON object:
{"intent": "create_request" | "other", "fields": { <field key>: <value> }, "unclear": [<short notes>]}

Rules:
1. Include a field ONLY if the speaker said it. Never guess, never add a default, never fill a value that was not said. Leave unsaid fields out completely.
2. Copy numbers exactly as said. Do no maths and no unit conversion. For a size give length, breadth and height in the spoken unit and put that unit in dimUnit.
3. "A by B by C" means length A, breadth B, height C.
4. When the speaker corrects themselves ("500 nahi 600", "500 sorry 600", "500 I mean 600", "500 matlab 600", "nahi nahi 45"), keep ONLY the last value.
5. Never return a rate or price. If a rate is mentioned, leave it out and add a note to "unclear".
6. company is the customer's company name as said, with normal capitalisation. Words around it like "ke liye", "ka", "se", "ki taraf se", "naya order" are not part of the name.
7. Use intent "other" when the text is not a box request (a question, a search, a command like "open", "show").
8. If the text has "Earlier:" and "Correction:", start from the earlier request and apply the correction: corrected values replace earlier ones, new values are added, everything else stays. Return the full result.
9. "unclear" lists things that were said but do not fit a field. Keep it empty otherwise.

Fields:
${fields}`;
}

/** [dictated (already normalized), expected JSON] */
export const FEW_SHOTS: readonly [string, object][] = [
  [
    "Sharma Packaging 500 box 12 by 10 by 8 inch 5 ply 30 kilo load 2 colour print",
    { intent: "create_request", fields: { company: "Sharma Packaging", quantity: 500, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2 }, unclear: [] },
  ],
  [
    "Verma Sweets ke liye 2000 box chahiye 10 by 8 by 4 inch 3 ply plain matlab no print stitched",
    { intent: "create_request", fields: { company: "Verma Sweets", quantity: 2000, length: 10, breadth: 8, height: 4, dimUnit: "inch", ply: 3, printColours: 0, joint: "Stitched" }, unclear: [] },
  ],
  [
    "Anand Electricals 300 boxes 450 by 300 by 250 mm 7 ply 40 kilo load nahi nahi 45 kilo glued",
    { intent: "create_request", fields: { company: "Anand Electricals", quantity: 300, length: 450, breadth: 300, height: 250, dimUnit: "mm", ply: 7, loadKg: 45, joint: "Glued" }, unclear: [] },
  ],
  [
    "Gupta Foods se Rakesh ji ka call tha 1000 box chahiye 14 by 10 by 6 inch 3 ply B flute 15 kilo load 1 colour print unka number 9876543210",
    { intent: "create_request", fields: { company: "Gupta Foods", contactPerson: "Rakesh", phone: "9876543210", quantity: 1000, length: 14, breadth: 10, height: 6, dimUnit: "inch", ply: 3, flute: "B", loadKg: 15, printColours: 1 }, unclear: [] },
  ],
  [
    "Mehta Plastics outer size 18 by 12 by 12 inch 7 ply BC flute die cut 250 pieces 40 kg load lamination chahiye",
    { intent: "create_request", fields: { company: "Mehta Plastics", sizeType: "Outer", length: 18, breadth: 12, height: 12, dimUnit: "inch", ply: 7, flute: "BC", style: "Die-cut", quantity: 250, loadKg: 40, coating: "Lamination" }, unclear: [] },
  ],
  [
    "Kapoor Textiles 600 by 400 by 400 cm sorry mm 5 ply 800 box",
    { intent: "create_request", fields: { company: "Kapoor Textiles", length: 600, breadth: 400, height: 400, dimUnit: "mm", ply: 5, quantity: 800 }, unclear: [] },
  ],
  [
    "Shree Ganesh Traders address plot 12 MIDC Bhiwandi GST number 27AAPFU0939F1ZV 5000 box 8 by 6 by 4 inch 3 ply RSC 2 colour print",
    { intent: "create_request", fields: { company: "Shree Ganesh Traders", address: "Plot 12, MIDC, Bhiwandi", gstin: "27AAPFU0939F1ZV", quantity: 5000, length: 8, breadth: 6, height: 4, dimUnit: "inch", ply: 3, style: "RSC", printColours: 2 }, unclear: [] },
  ],
  [
    "Jain Medicals 1500 box 9 by 7 by 5 inch 3 ply customer bol raha hai rate 12 rupees chalega",
    { intent: "create_request", fields: { company: "Jain Medicals", quantity: 1500, length: 9, breadth: 7, height: 5, dimUnit: "inch", ply: 3 }, unclear: ["customer mentioned a rate of 12 rupees; the rate is set separately"] },
  ],
  [
    "Patel Agro andar ka size 300 by 200 by 150 mm 5 ply 150 gsm 18 bf bursting strength 12 6 khane ka partition 700 box",
    { intent: "create_request", fields: { company: "Patel Agro", sizeType: "Inner", length: 300, breadth: 200, height: 150, dimUnit: "mm", ply: 5, gsm: 150, bf: 18, burstingStrength: 12, partitions: "6 khane", quantity: 700 }, unclear: [] },
  ],
  [
    "naya order Singh Brothers ka 400 box",
    { intent: "create_request", fields: { company: "Singh Brothers", quantity: 400 }, unclear: [] },
  ],
  [
    "Earlier: Sharma Packaging 500 box 12 by 10 by 8 inch 5 ply 30 kilo load 2 colour print. Correction: nahi 600 box aur B flute",
    { intent: "create_request", fields: { company: "Sharma Packaging", quantity: 600, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, loadKg: 30, printColours: 2, flute: "B" }, unclear: [] },
  ],
  [
    "Sharma Packaging ka card dikhao",
    { intent: "other", fields: {}, unclear: [] },
  ],
];

/** Builds the full chat: system prompt, the examples as past turns, then the new text. */
export function buildMessages(normalizedText: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt() }];
  for (const [input, output] of FEW_SHOTS) {
    messages.push({ role: "user", content: input });
    messages.push({ role: "assistant", content: JSON.stringify(output) });
  }
  messages.push({ role: "user", content: normalizedText });
  return messages;
}

/** The text sent for a spoken correction to a plan that is still waiting. */
export function correctionText(earlier: string, correction: string): string {
  return `Earlier: ${earlier}. Correction: ${correction}`;
}
