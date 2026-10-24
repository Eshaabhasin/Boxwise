import { NextResponse } from "next/server";
import { getPendingPlanResult, handleCommand } from "@/lib/commands/handle";
import { CommandInput, type CommandResult } from "@/lib/commands/types";

function message(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/MONGODB_URI|ECONNREFUSED|querySrv|ServerSelection/i.test(text)) {
    return "Can't reach the database. Check MONGODB_URI in .env.local and restart the server.";
  }
  return `Something went wrong: ${text}`;
}

// The single entry point for everything dictated.
export async function POST(request: Request) {
  const parsed = CommandInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const result: CommandResult = { kind: "error", text: parsed.error.issues[0]?.message ?? "Invalid command" };
    return NextResponse.json(result, { status: 400 });
  }
  try {
    return NextResponse.json(await handleCommand(parsed.data.text, parsed.data.path));
  } catch (err) {
    console.error("command failed", err);
    const result: CommandResult = { kind: "error", text: message(err) };
    return NextResponse.json(result, { status: 500 });
  }
}

/** The plan waiting for approval, if any, so a screen can show it after a reload. */
export async function GET() {
  try {
    return NextResponse.json({ plan: await getPendingPlanResult() });
  } catch {
    return NextResponse.json({ plan: null });
  }
}
