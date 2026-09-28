import { NextResponse } from "next/server";
import { createKiwoomAdapter } from "@/lib/kiwoom";
import { createMarketDataAdapter } from "@/lib/market-data";
import { readStore } from "@/lib/storage";
import { submitKiwoomTrade, type TradeRequest } from "@/lib/kiwoom/trade-service";

export const dynamic = "force-dynamic";

/** Feature ID: trade.kiwoom — adapter status */
export async function GET() {
  const adapter = createKiwoomAdapter();
  return NextResponse.json({ status: adapter.status() });
}

/** Buy, sell, or scale-in. Real host requires confirmLive. */
export async function POST(req: Request) {
  const body = (await req.json()) as Partial<TradeRequest> & { symbolId?: string };

  if (!body.symbolId || !body.side || !body.qty || body.qty <= 0) {
    return NextResponse.json({ error: "symbolId, side, qty required" }, { status: 400 });
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
        exchange: symbol.exchange,
        assetClass: symbol.assetClass,
        timeframe: "1",
        limit: 1,
      });
      lastPrice = bars.at(-1)?.close;
    } catch {
      lastPrice = undefined;
    }
  }

  const result = await submitKiwoomTrade({
    symbolId: symbol.id,
    ticker: symbol.ticker,
    exchange: symbol.exchange,
    assetClass: symbol.assetClass,
    side: body.side,
    type: body.type ?? "market",
    qty: body.qty,
    limitPrice: body.limitPrice,
    takeProfit: body.takeProfit,
    stopLoss: body.stopLoss,
    confirmLive: body.confirmLive,
    lastPrice,
    scale: body.scale,
  });

  if (!result.ok) {
    return NextResponse.json({ result }, { status: 400 });
  }
  return NextResponse.json({ result });
}
