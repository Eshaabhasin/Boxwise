import { z } from "zod";
import { BOARD_FILTERS } from "@/lib/board";
import { STAGES } from "@/lib/fields";

export const INTENTS = ["create_request", "edit_request", "set_rate", "search", "open", "set_stage", "other"] as const;
export type Intent = (typeof INTENTS)[number];

/** The only shape the LLM may return. Anything else is rejected and retried once. */
export const LlmCommandOutput = z.object({
  intent: z.enum(INTENTS),
  /** Which card: a company name or "REQ 3" as said; null means the card on screen. */
  target: z.string().nullable().default(null),
  stage: z.enum(STAGES).nullable().default(null),
  /** Company words to search for. */
  query: z.string().nullable().default(null),
  filter: z.enum(BOARD_FILTERS).nullable().default(null),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  unclear: z.array(z.string()).default([]),
});
export type LlmCommandOutput = z.infer<typeof LlmCommandOutput>;
