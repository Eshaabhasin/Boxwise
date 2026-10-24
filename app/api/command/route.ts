import { NextResponse } from "next/server";
import { CommandInput, type CommandResult } from "@/lib/commands/types";

// The single entry point for everything dictated. Phase 1 only echoes the text
// so the command box can be tested; parsing arrives in phase 2.
export async function POST(request: Request) {
  const parsed = CommandInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const result: CommandResult = { kind: "error", text: parsed.error.issues[0]?.message ?? "Invalid command" };
    return NextResponse.json(result, { status: 400 });
  }
  const result: CommandResult = {
    kind: "message",
    text: `Heard on ${parsed.data.path}: "${parsed.data.text}". Understanding requests arrives in phase 2.`,
  };
  return NextResponse.json(result);
}
