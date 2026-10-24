import { z } from "zod";

/** The only shape the LLM may return. Anything else is rejected and retried once. */
export const LlmRequestOutput = z.object({
  intent: z.enum(["create_request", "other"]),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  unclear: z.array(z.string()).default([]),
});
export type LlmRequestOutput = z.infer<typeof LlmRequestOutput>;
