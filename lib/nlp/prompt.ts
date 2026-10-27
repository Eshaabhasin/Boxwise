import { FIELD_DEFS, type FieldDef } from "@/lib/fields";
import type { ChatMessage } from "@/lib/nlp/llm";

/**
 * The command-reading prompt. The field list is built from lib/fields.ts, so
 * editing that file updates the prompt. Each message carries the screen it
 * was said on, so "height 9 inch kar do" on a card means that card.
 *
 * Kept small on purpose: every command sends all of it, and Groq's free tier
 * counts tokens per minute and per day. Each example below teaches something
 * the others don't; add one only for a mistake the harness actually found.
 * The text the LLM sees is already normalized: numbers are digits.
 */

const KIND: Record<FieldDef["kind"], string> = {
  text: "text as said",
  phone: "digits",
  gstin: "15-char GSTIN as said",
  int: "whole number",
  length: "number in the spoken unit",
  kg: "kg",
  money: "rupees, ONLY in set_rate",
  percent: "percent",
  enum: "",
};

function describe(f: FieldDef): string {
  const type = f.kind === "enum" ? (f.options ?? []).join("|") : f.options ? `${KIND[f.kind]} ${f.options.join("|")}` : KIND[f.kind];
  const aliases = f.aliases.length ? ` (${f.aliases.join(", ")})` : "";
  return `${f.key}: ${type}${aliases}${f.hint ? `. ${f.hint}` : ""}`;
}

export function systemPrompt(): string {
  return `You read commands that a corrugated box factory owner in India dictates by voice (Hinglish, no punctuation, numbers already digits) and return one JSON object:
{"intent", "target", "stage", "query", "filter", "fields": {key: value}, "unclear": [notes]}
Each message gives the screen he is on, then what he said.

Intents:
- create_request: a new box request from a customer.
- repeat_request: new card copying a customer's last order ("same as last time for X"). target = company; fields = only what changes.
- edit_request: change an existing card. fields = only the changed fields.
- set_rate: his own rate and/or terms for a card (ratePerBox, gstPercent, deliveryTime, paymentTerms, validity, plus anything else he changes).
- search: find cards or quotations. query = company words or null; filter = Pending|New|Quoted|Sent|Won|Lost|All or null.
- open: open one card.
- set_stage: stage = Won ("order mil gaya"), Lost ("mana kar diya", "order nahi mila") or New.
- other: anything else.
target = company name or "REQ <n>" as said, for repeat/edit/set_rate/open/set_stage; null if none was said (he means the card on screen).

Rules:
1. Include a field ONLY if he said it. Never guess or add defaults.
2. Copy numbers as said; no maths, no unit conversion. Sizes: sides in the spoken unit, unit in dimUnit (only if said). "A by B by C" = length, breadth, height.
3. Corrections ("500 nahi 600", "sorry", "I mean", "matlab", "nahi nahi") keep only the last value.
4. Never suggest or calculate a rate. ratePerBox only in set_rate; anywhere else leave it out and note it in unclear.
5. company = the customer's name as said, capitalised; not "ke liye", "ka", "se", "naya order". A name that only picks the card goes in target.
6. "Earlier: ... Correction: ..." means apply the correction to the earlier command and return the full result, same intent.
7. Terms are short text in his words ("10 days", "30 din credit").

Fields:
${FIELD_DEFS.map(describe).join("\n")}`;
}

export type Screen = string;

/** [screen, dictated (already normalized), expected JSON]. Unused keys are left out; zod fills them. */
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
    "Gupta Foods se Rakesh ji ka call tha 1000 box chahiye 14 by 10 by 6 inch 3 ply B flute 1 colour print unka number 9876543210",
    { intent: "create_request", fields: { company: "Gupta Foods", contactPerson: "Rakesh", phone: "9876543210", quantity: 1000, length: 14, breadth: 10, height: 6, dimUnit: "inch", ply: 3, flute: "B", printColours: 1 } },
  ],
  [
    "board",
    "Mehta Plastics outer size 18 by 12 by 12 inch 7 ply BC flute die cut 250 pieces lamination chahiye",
    { intent: "create_request", fields: { company: "Mehta Plastics", sizeType: "Outer", length: 18, breadth: 12, height: 12, dimUnit: "inch", ply: 7, flute: "BC", style: "Die-cut", quantity: 250, coating: "Lamination" } },
  ],
  [
    "new quote",
    "Shree Ganesh Traders address plot 12 MIDC Bhiwandi GST number 27AAPFU0939F1ZV 5000 box 8 by 6 by 4 inch RSC",
    { intent: "create_request", fields: { company: "Shree Ganesh Traders", address: "Plot 12, MIDC, Bhiwandi", gstin: "27AAPFU0939F1ZV", quantity: 5000, length: 8, breadth: 6, height: 4, dimUnit: "inch", style: "RSC" } },
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
    "Earlier: Sharma Packaging 500 box 12 by 10 by 8 inch 5 ply. Correction: nahi 600 box aur B flute",
    { intent: "create_request", fields: { company: "Sharma Packaging", quantity: 600, length: 12, breadth: 10, height: 8, dimUnit: "inch", ply: 5, flute: "B" } },
  ],
  [
    "card REQ-001 Sharma Packaging",
    "height 9 inch kar do aur joint glued",
    { intent: "edit_request", fields: { height: 9, dimUnit: "inch", joint: "Glued" } },
  ],
  [
    "board",
    "Sharma Packaging ka address Bhiwandi godown daal do aur phone 9820012345",
    { intent: "edit_request", target: "Sharma Packaging", fields: { address: "Bhiwandi godown", phone: "9820012345" } },
  ],
  [
    "card REQ-001 Sharma Packaging",
    "rate 18 rupees per box GST 18 percent delivery 10 days payment 50 percent advance validity 15 din",
    { intent: "set_rate", fields: { ratePerBox: 18, gstPercent: 18, deliveryTime: "10 days", paymentTerms: "50 percent advance", validity: "15 din" } },
  ],
  [
    "board",
    "Gupta Foods ka rate 9 rupees 50 paise aur 1000 box kar do",
    { intent: "set_rate", target: "Gupta Foods", fields: { ratePerBox: 9.5, quantity: 1000 } },
  ],
  [
    "new quote",
    "Gupta Foods wala pichla order phir se bas 2000 box",
    { intent: "repeat_request", target: "Gupta Foods", fields: { quantity: 2000 } },
  ],
  [
    "quotation history",
    "Mehta Plastics ki history",
    { intent: "search", query: "Mehta Plastics" },
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
    "card REQ-004 Mehta Plastics",
    "ye order nahi mila customer ne mana kar diya",
    { intent: "set_stage", stage: "Lost" },
  ],
  [
    "board",
    "aaj kitne order aaye",
    { intent: "other" },
  ],
];

function userMessage(screen: Screen, said: string): string {
  return `Screen: ${screen}\nSaid: ${said}`;
}

/** Builds the full chat: system prompt, the examples as past turns, then the new text. */
export function buildMessages(normalizedText: string, screen: Screen): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt() }];
  for (const [shotScreen, input, output] of FEW_SHOTS) {
    messages.push({ role: "user", content: userMessage(shotScreen, input) });
    messages.push({ role: "assistant", content: JSON.stringify(output) });
  }
  messages.push({ role: "user", content: userMessage(screen, normalizedText) });
  return messages;
}

/** The text sent for a spoken correction to a plan that is still waiting. */
export function correctionText(earlier: string, correction: string): string {
  return `Earlier: ${earlier}. Correction: ${correction}`;
}
