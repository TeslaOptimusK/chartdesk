import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { readPaperAccount, savePaperAccount } from "@/lib/storage";
import type { PaperAccount, PaperOrder } from "@/lib/types";

/** Feature ID: trade.paper */
export async function GET() {
  const account = await readPaperAccount();
  return NextResponse.json({ account });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { account?: PaperAccount };
  if (!body.account) {
    return NextResponse.json({ error: "account required" }, { status: 400 });
  }
  const account = await savePaperAccount(body.account);
  return NextResponse.json({ account });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    symbolId?: string;
    side?: "buy" | "sell";
    type?: "market" | "limit";
    qty?: number;
    limitPrice?: number;
    mockLast?: number;
  };
  if (!body.symbolId || !body.side || !body.qty || body.qty <= 0) {
    return NextResponse.json({ error: "invalid order" }, { status: 400 });
  }
  const account = await readPaperAccount();
  const last = body.mockLast ?? body.limitPrice ?? 100;
  const fillPrice =
    body.type === "limit" && body.limitPrice ? body.limitPrice : last;
  const cost = fillPrice * body.qty;

  const order: PaperOrder = {
    id: `po_${randomUUID().slice(0, 8)}`,
    symbolId: body.symbolId,
    side: body.side,
    type: body.type ?? "market",
    qty: body.qty,
    limitPrice: body.limitPrice,
    status: "filled",
    fillPrice,
    createdAt: new Date().toISOString(),
  };

  if (body.side === "buy") {
    if (account.cash < cost) {
      return NextResponse.json({ error: "insufficient cash" }, { status: 400 });
    }
    account.cash -= cost;
    const pos = account.positions.find((p) => p.symbolId === body.symbolId);
    if (pos) {
      const totalQty = pos.qty + body.qty;
      pos.avgCost = (pos.avgCost * pos.qty + cost) / totalQty;
      pos.qty = totalQty;
    } else {
      account.positions.push({
        symbolId: body.symbolId,
        qty: body.qty,
        avgCost: fillPrice,
      });
    }
  } else {
    const pos = account.positions.find((p) => p.symbolId === body.symbolId);
    if (!pos || pos.qty < body.qty) {
      return NextResponse.json({ error: "insufficient shares" }, { status: 400 });
    }
    pos.qty -= body.qty;
    account.cash += cost;
    if (pos.qty <= 0) {
      account.positions = account.positions.filter(
        (p) => p.symbolId !== body.symbolId
      );
    }
  }

  account.orders.unshift(order);
  account.orders = account.orders.slice(0, 50);
  const saved = await savePaperAccount(account);
  return NextResponse.json({ account: saved, order });
}
