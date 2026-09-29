import { NextResponse } from "next/server";
import { cancelBracketOrders, disarmBracket, updateBracketLevels } from "@/lib/kiwoom/brackets";

export const dynamic = "force-dynamic";

/** Move the fill, target, and stop that the chart lines edit. */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    symbolId?: string;
    code?: string;
    qty?: number;
    entryPrice?: number | null;
    takeProfit?: number | null;
    stopLoss?: number | null;
  } | null;
  if (!body?.symbolId || !body.code) {
    return NextResponse.json({ error: "symbolId and code required" }, { status: 400 });
  }
  const num = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? null : value;
  const bracket = await updateBracketLevels({
    symbolId: body.symbolId,
    code: body.code,
    qty: body.qty ?? 0,
    entryPrice: num(body.entryPrice),
    takeProfit: num(body.takeProfit),
    stopLoss: num(body.stopLoss),
  });
  return NextResponse.json({ ok: true, bracket });
}

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
