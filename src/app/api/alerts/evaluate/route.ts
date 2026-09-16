import { NextResponse } from "next/server";
import { evaluateSymbolAlerts } from "@/lib/alert-engine";
import { createMarketDataAdapter } from "@/lib/market-data";
import { readStore } from "@/lib/storage";
import type { Candle, Timeframe } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    symbolId?: string;
    candles?: Candle[];
    lastClose?: number;
    tf?: Timeframe;
    limit?: number;
  };

  if (!body.symbolId) {
    return NextResponse.json({ error: "symbolId required" }, { status: 400 });
  }

  const store = await readStore();
  const symbol = store.symbols.find((s) => s.id === body.symbolId);
  if (!symbol) {
    return NextResponse.json({ error: "symbol not found" }, { status: 404 });
  }

  let candles = body.candles;
  if (!candles?.length) {
    const tf = body.tf ?? "D";
    const adapter = createMarketDataAdapter();
    candles = await adapter.getCandles({
      symbolId: symbol.id,
      ticker: symbol.ticker,
      timeframe: tf === "tick" ? "1" : tf,
      limit: body.limit ?? 240,
    });
  }

  const result = await evaluateSymbolAlerts({
    symbolId: body.symbolId,
    candles,
    lastClose: body.lastClose,
  });

  const alertsStore = await readStore();

  return NextResponse.json({
    fired: result.fired,
    priceWatches: result.priceWatches,
    technicalAlerts: result.technicalAlerts,
    multiConditionAlerts: result.multiConditionAlerts,
    alerts: alertsStore.alerts,
  });
}
