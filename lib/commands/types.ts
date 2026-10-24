import { z } from "zod";

/** What the command box sends: the dictated text and the screen it was spoken on. */
export const CommandInput = z.object({
  text: z.string().trim().min(1, "Nothing was dictated").max(4000),
  path: z.string().max(300).default("/"),
});
export type CommandInput = z.infer<typeof CommandInput>;

/** What /api/command answers. */
export const CommandResult = z.discriminatedUnion("kind", [
  /** A change waiting for "approve" or a spoken correction. */
  z.object({
    kind: z.literal("plan"),
    planId: z.string(),
    title: z.string(),
    lines: z.array(z.string()),
    warnings: z.array(z.string()).default([]),
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
]);
export type CommandResult = z.infer<typeof CommandResult>;
