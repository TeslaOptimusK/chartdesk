import type { MarketDataAdapter } from "@/lib/market-data/types";
import { MockMarketDataAdapter } from "@/lib/market-data/mock-adapter";
import { DelayedMarketDataAdapter } from "@/lib/market-data/delayed-adapter";
import { RealtimeMarketDataAdapter } from "@/lib/market-data/realtime-adapter";

/** Factory — mock | delayed | realtime. Default: delayed Yahoo (no API key). */
export function createMarketDataAdapter(): MarketDataAdapter {
  const mode = (process.env.MARKET_DATA_MODE ?? "delayed").toLowerCase();
  if (mode === "mock") return new MockMarketDataAdapter();
  if (mode === "realtime") return new RealtimeMarketDataAdapter();
  return new DelayedMarketDataAdapter();
}

export function marketDataMode(): "mock" | "delayed" | "realtime" {
  const mode = (process.env.MARKET_DATA_MODE ?? "delayed").toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "realtime") return "realtime";
  return "delayed";
}

export type { MarketDataAdapter, CandleQuery } from "@/lib/market-data/types";
export { secondsPerBar } from "@/lib/market-data/types";
