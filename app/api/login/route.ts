import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, passcodeMatches } from "@/lib/auth";
import { env } from "@/lib/env";

const LoginInput = z.object({ passcode: z.string().trim().min(1).max(200) });

export async function POST(request: Request) {
  const parsed = LoginInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the passcode" }, { status: 400 });
  }
  const { APP_PASSCODE, SESSION_SECRET } = env();
  if (!passcodeMatches(parsed.data.passcode, APP_PASSCODE)) {
    // Slow down guessing.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
