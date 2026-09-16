import type { MarketDataAdapter } from "@/lib/market-data/types";
import { MockMarketDataAdapter } from "@/lib/market-data/mock-adapter";
import { DelayedMarketDataAdapter } from "@/lib/market-data/delayed-adapter";
import { RealtimeMarketDataAdapter } from "@/lib/market-data/realtime-adapter";

/** Factory — mock | delayed | realtime */
export function createMarketDataAdapter(): MarketDataAdapter {
  const mode = (process.env.MARKET_DATA_MODE ?? "mock").toLowerCase();
  if (mode === "delayed") return new DelayedMarketDataAdapter();
  if (mode === "realtime") return new RealtimeMarketDataAdapter();
  return new MockMarketDataAdapter();
}

export function marketDataMode(): "mock" | "delayed" | "realtime" {
  const mode = (process.env.MARKET_DATA_MODE ?? "mock").toLowerCase();
  if (mode === "delayed") return "delayed";
  if (mode === "realtime") return "realtime";
  return "mock";
}

export type { MarketDataAdapter, CandleQuery } from "@/lib/market-data/types";
export { secondsPerBar } from "@/lib/market-data/types";
