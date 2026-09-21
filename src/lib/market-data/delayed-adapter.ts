import type { Candle } from "@/lib/types";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";
import { MockMarketDataAdapter, generateMockCandles } from "@/lib/market-data/mock-adapter";

/**
 * Delayed quotes adapter — uses free/public endpoints when keys exist,
 * otherwise falls back to deterministic mock candles.
 * Swap implementation body for Polygon/Twelve Data/etc. without changing callers.
 */
export class DelayedMarketDataAdapter implements MarketDataAdapter {
  readonly id = "delayed";
  readonly label = "Delayed / free quotes";
  readonly mode = "delayed" as const;
  private fallback = new MockMarketDataAdapter();

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    const apiKey = process.env.MARKET_DATA_API_KEY;
    const baseUrl = process.env.MARKET_DATA_BASE_URL;

    if (!apiKey || !baseUrl) {
      // No keys: delayed mock with slight lag stamp in volume field unused
      return generateMockCandles(query);
    }

    try {
      const url = new URL("/candles", baseUrl);
      url.searchParams.set("symbol", query.ticker);
      url.searchParams.set("tf", query.timeframe);
      if (query.limit) url.searchParams.set("limit", String(query.limit));
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 60 },
      });
      if (!res.ok) throw new Error(`Market data HTTP ${res.status}`);
      const data = (await res.json()) as Candle[];
      if (!Array.isArray(data) || data.length === 0) {
        return this.fallback.getCandles(query);
      }
      return data;
    } catch {
      return this.fallback.getCandles(query);
    }
  }

  subscribe(query: CandleQuery, onCandle: (candle: Candle) => void) {
    const apiKey = process.env.MARKET_DATA_API_KEY;
    const baseUrl = process.env.MARKET_DATA_BASE_URL;

    // Offline / no keys: same live forming-bar stream as mock so 1m wicks move.
    if (!apiKey || !baseUrl) {
      return this.fallback.subscribe(query, onCandle);
    }

    // Realtime WS not available on free delayed tier — poll slowly.
    const pollMs = Number(process.env.MARKET_DATA_POLL_MS ?? 30_000);
    const timer = setInterval(() => {
      void this.getCandles({ ...query, limit: 1 }).then((bars) => {
        const last = bars.at(-1);
        if (last) onCandle(last);
      });
    }, pollMs);
    return () => clearInterval(timer);
  }
}
