import { z } from "zod";
import { BOARD_FILTERS } from "@/lib/board";
import { STAGES } from "@/lib/fields";

export const INTENTS = ["create_request", "repeat_request", "edit_request", "set_rate", "search", "open", "set_stage", "other"] as const;
export type Intent = (typeof INTENTS)[number];

const Values = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

/** One box in the reply: which box (1, 2… on the card, "new" to add one, null when only one box is meant) and its fields. */
export const LlmBox = z.object({
  box: z.union([z.number().int().positive(), z.literal("new"), z.null()]).default(null),
  fields: Values.default({}),
});
export type LlmBox = z.infer<typeof LlmBox>;

/** The only shape the LLM may return. Anything else is rejected and retried once. */
export const LlmCommandOutput = z.object({
  intent: z.enum(INTENTS),
  /** Which card: a company name or "REQ 3" as said; null means the card on screen. */
  target: z.string().nullable().default(null),
  stage: z.enum(STAGES).nullable().default(null),
  /** Company words to search for. */
  query: z.string().nullable().default(null),
  filter: z.enum(BOARD_FILTERS).nullable().default(null),
  /** Customer fields, GST % and terms (and, for a single box, its fields may come here too). */
  fields: Values.default({}),
  /** The boxes said, each with its own fields. */
  boxes: z.array(LlmBox).default([]),
  /** True when the top-level box fields are for every box ("sab boxes 5 ply"). */
  allBoxes: z.boolean().default(false),
  /** Box numbers to remove from the card. */
  remove: z.array(z.number().int().positive()).default([]),
  unclear: z.array(z.string()).default([]),
});
export type LlmCommandOutput = z.infer<typeof LlmCommandOutput>;
