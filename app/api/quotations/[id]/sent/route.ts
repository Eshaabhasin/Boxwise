import { NextResponse } from "next/server";
import { z } from "zod";
import { markSent } from "@/lib/quote/send";

const SentInput = z.object({ via: z.enum(["share", "link"]) });

// Called by the Send button after the share sheet (or the WhatsApp link) opened.
export async function POST(request: Request, { params }: RouteContext<"/api/quotations/[id]/sent">) {
  const { id } = await params;
  const parsed = SentInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const result = await markSent(id, parsed.data.via);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: 400 });
}
