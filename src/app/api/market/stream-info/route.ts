import { NextResponse } from "next/server";
import { createMarketDataAdapter, marketDataMode } from "@/lib/market-data";

export async function GET() {
  const adapter = createMarketDataAdapter();
  const mode = marketDataMode();
  const pollMs = Number(process.env.MARKET_DATA_POLL_MS ?? (mode === "realtime" ? 3000 : 30_000));
  return NextResponse.json({
    mode,
    adapter: { id: adapter.id, label: adapter.label, mode: adapter.mode },
    pollMs,
    ssePath: "/api/market/sse",
    wsConfigured: Boolean(process.env.MARKET_DATA_WS_URL?.trim()),
  });
}
