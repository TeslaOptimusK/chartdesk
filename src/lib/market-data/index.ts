import type { MarketDataAdapter } from "@/lib/market-data/types";
import { MockMarketDataAdapter } from "@/lib/market-data/mock-adapter";
import { DelayedMarketDataAdapter } from "@/lib/market-data/delayed-adapter";
import { RealtimeMarketDataAdapter } from "@/lib/market-data/realtime-adapter";
import { KiwoomRoutedMarketDataAdapter } from "@/lib/market-data/kiwoom-adapter";
import { CryptoVenueMarketDataAdapter } from "@/lib/market-data/crypto-adapter";
import { kiwoomQuotesConfigured } from "@/lib/kiwoom/quote-rest";

function createBaseAdapter(): MarketDataAdapter {
  const mode = (process.env.MARKET_DATA_MODE ?? "delayed").toLowerCase();
  if (mode === "mock") return new MockMarketDataAdapter();
  if (mode === "realtime") return new RealtimeMarketDataAdapter();
  return new DelayedMarketDataAdapter();
}

/**
 * Factory — mock | delayed | realtime.
 * When KIWOOM_APP_KEY and KIWOOM_APP_SECRET are set, KRX 6-digit symbols
 * use Kiwoom realtime and other symbols stay on the base adapter.
 */
export function createMarketDataAdapter(): MarketDataAdapter {
  const base = new CryptoVenueMarketDataAdapter(createBaseAdapter());
  if (kiwoomQuotesConfigured()) return new KiwoomRoutedMarketDataAdapter(base);
  return base;
}

export function marketDataMode(): "mock" | "delayed" | "realtime" {
  if (kiwoomQuotesConfigured()) return "realtime";
  const mode = (process.env.MARKET_DATA_MODE ?? "delayed").toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "realtime") return "realtime";
  return "delayed";
}

export type { MarketDataAdapter, CandleQuery } from "@/lib/market-data/types";
export { secondsPerBar } from "@/lib/market-data/types";
