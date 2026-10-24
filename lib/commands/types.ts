import { z } from "zod";
import { STAGES } from "@/lib/fields";
import { WAITING_ON, type BoxCardView } from "@/lib/board";

/** What the command box sends: the dictated text and the screen it was spoken on. */
export const CommandInput = z.object({
  text: z.string().trim().min(1, "Nothing was dictated").max(4000),
  path: z.string().max(300).default("/"),
});
export type CommandInput = z.infer<typeof CommandInput>;

export const BoxCardViewSchema: z.ZodType<BoxCardView> = z.object({
  id: z.string(),
  ref: z.string().nullable(),
  company: z.string(),
  stage: z.enum(STAGES),
  size: z.string().nullable(),
  ply: z.string().nullable(),
  load: z.string().nullable(),
  quantity: z.string().nullable(),
  print: z.string().nullable(),
  missing: z.array(z.string()),
  waitingOn: z.enum(WAITING_ON).nullable(),
});

/** What /api/command answers. */
export const CommandResult = z.discriminatedUnion("kind", [
  /** A change waiting for "approve" or a spoken correction. */
  z.object({
    kind: z.literal("plan"),
    planId: z.string(),
    title: z.string(),
    lines: z.array(z.string()),
    warnings: z.array(z.string()).default([]),
    card: BoxCardViewSchema.optional(),
  }),
  /** Something happened (or nothing needed to); show the message. */
  z.object({
    kind: z.literal("message"),
    text: z.string(),
    navigateTo: z.string().optional(),
  }),
  z.object({
    kind: z.literal("error"),
    text: z.string(),
  }),
  /** Open the share sheet for this quotation (the screen's Send button does the sending). */
  z.object({
    kind: z.literal("share"),
    quotationId: z.string(),
    text: z.string(),
  }),
]);
export type CommandResult = z.infer<typeof CommandResult>;
