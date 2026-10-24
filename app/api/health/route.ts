import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { Customer, Quotation, Request } from "@/lib/models";

// Quick check that MongoDB is reachable and the collections exist.
export async function GET() {
  try {
    await connectDb();
    await Promise.all([Customer.init(), Request.init(), Quotation.init()]);
    const [customers, requests, quotations] = await Promise.all([
      Customer.countDocuments(),
      Request.countDocuments(),
      Quotation.countDocuments(),
    ]);
    return NextResponse.json({ ok: true, customers, requests, quotations });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
