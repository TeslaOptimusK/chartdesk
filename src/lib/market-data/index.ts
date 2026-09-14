import type { MarketDataAdapter } from "@/lib/market-data/types";
import { MockMarketDataAdapter } from "@/lib/market-data/mock-adapter";
import { DelayedMarketDataAdapter } from "@/lib/market-data/delayed-adapter";

/** Factory — ready for a future RealtimeMarketDataAdapter. */
export function createMarketDataAdapter(): MarketDataAdapter {
  const mode = (process.env.MARKET_DATA_MODE ?? "mock").toLowerCase();
  if (mode === "delayed") return new DelayedMarketDataAdapter();
  if (mode === "realtime") {
    // Realtime vendor adapter not configured — degrade gracefully.
    return new DelayedMarketDataAdapter();
  }
  return new MockMarketDataAdapter();
}

export type { MarketDataAdapter, CandleQuery } from "@/lib/market-data/types";
export { secondsPerBar } from "@/lib/market-data/types";
