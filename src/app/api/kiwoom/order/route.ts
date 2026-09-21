import { NextResponse } from "next/server";
import { createKiwoomAdapter } from "@/lib/kiwoom";
import { createMarketDataAdapter } from "@/lib/market-data";
import { readStore } from "@/lib/storage";
import type { KiwoomOrderSide, KiwoomOrderType } from "@/lib/kiwoom/types";

export const dynamic = "force-dynamic";

/** Feature ID: trade.kiwoom — adapter status */
export async function GET() {
  const adapter = createKiwoomAdapter();
  return NextResponse.json({ status: adapter.status() });
}

/** Place buy/sell via Kiwoom adapter (mock fills by default). */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    symbolId?: string;
    side?: KiwoomOrderSide;
    type?: KiwoomOrderType;
    qty?: number;
    limitPrice?: number;
    lastPrice?: number;
  };

  if (!body.symbolId || !body.side || !body.qty || body.qty <= 0) {
    return NextResponse.json(
      { error: "symbolId, side, qty required" },
      { status: 400 }
    );
  }

  const store = await readStore();
  const symbol = store.symbols.find((s) => s.id === body.symbolId);
  if (!symbol) {
    return NextResponse.json({ error: "symbol not found" }, { status: 404 });
  }

  let lastPrice = body.lastPrice;
  if (lastPrice == null || !Number.isFinite(lastPrice)) {
    try {
      const md = createMarketDataAdapter();
      const bars = await md.getCandles({
        symbolId: symbol.id,
        ticker: symbol.ticker,
        timeframe: "1",
        limit: 1,
      });
      lastPrice = bars.at(-1)?.close;
    } catch {
      lastPrice = undefined;
    }
  }

  const adapter = createKiwoomAdapter();
  const result = await adapter.placeOrder({
    symbolId: symbol.id,
    ticker: symbol.ticker,
    side: body.side,
    type: body.type ?? "market",
    qty: body.qty,
    limitPrice: body.limitPrice,
    lastPrice,
  });

  if (!result.ok) {
    return NextResponse.json({ result }, { status: 400 });
  }
  return NextResponse.json({ result });
}
