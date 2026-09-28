import { NextResponse } from "next/server";
import { cancelBracketOrders, disarmBracket } from "@/lib/kiwoom/brackets";

export const dynamic = "force-dynamic";

/** Drop a take-profit / stop watch. `cancel=1` also cancels its resting scale-in buys. */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const cancel = url.searchParams.get("cancel") === "1";
  const cancelled = cancel ? await cancelBracketOrders(id) : { cancelled: 0, failed: 0 };
  const ok = await disarmBracket(id);
  if (!ok) return NextResponse.json({ error: "bracket not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...cancelled });
}
