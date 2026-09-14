import { NextResponse } from "next/server";
import { createMarketDataAdapter } from "@/lib/market-data";
import { readStore } from "@/lib/storage";
import type { Timeframe } from "@/lib/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolId = searchParams.get("symbolId");
  const timeframe = (searchParams.get("tf") ?? "D") as Timeframe;
  const limit = Number(searchParams.get("limit") ?? 180);

  if (!symbolId) {
    return NextResponse.json({ error: "symbolId required" }, { status: 400 });
  }

  const store = await readStore();
  const symbol = store.symbols.find((s) => s.id === symbolId);
  if (!symbol) {
    return NextResponse.json({ error: "symbol not found" }, { status: 404 });
  }

  const adapter = createMarketDataAdapter();
  const candles = await adapter.getCandles({
    symbolId: symbol.id,
    ticker: symbol.ticker,
    timeframe,
    limit,
  });

  return NextResponse.json({
    adapter: { id: adapter.id, label: adapter.label, mode: adapter.mode },
    symbol,
    timeframe,
    candles,
  });
}
