import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Readiness probe for the desktop launcher. No store, no account, no cookie. */
export function GET() {
  return NextResponse.json({ ok: true });
}
