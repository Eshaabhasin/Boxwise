import { NextResponse } from "next/server";
import { CompanyProfile } from "@/lib/company";
import { getCompany, saveCompany } from "@/lib/settings";

/** Your company's letterhead details. */
export async function GET() {
  return NextResponse.json({ company: await getCompany() });
}

/** Saves changed letterhead details. Any subset of fields may be sent. */
export async function PATCH(request: Request) {
  const parsed = CompanyProfile.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Those details don't look right." }, { status: 400 });
  }
  const { bank, ...rest } = parsed.data;
  const result = await saveCompany({ ...rest, ...(bank ? { bank } : {}) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, company: result.company });
}
