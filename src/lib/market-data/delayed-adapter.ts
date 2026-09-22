import type { Candle } from "@/lib/types";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";
import {
  MockMarketDataAdapter,
  generateMockCandles,
} from "@/lib/market-data/mock-adapter";
import {
  createYahooPollSubscriber,
  fetchYahooCandles,
  toYahooSymbol,
} from "@/lib/market-data/yahoo";

/**
 * Delayed quotes — Yahoo Finance chart API (no key) first;
 * mock only for unmapped symbols or fetch failures.
 */
export class DelayedMarketDataAdapter implements MarketDataAdapter {
  readonly id = "delayed";
  readonly label = "지연시세 (Yahoo)";
  readonly mode = "delayed" as const;
  private fallback = new MockMarketDataAdapter();

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    const mapped = toYahooSymbol(
      query.ticker,
      query.exchange,
      query.assetClass
    );
    if (!mapped) {
      return generateMockCandles(query);
    }

    const bars = await fetchYahooCandles(query);
    if (bars?.length) return bars;
    return this.fallback.getCandles(query);
  }

  subscribe(query: CandleQuery, onCandle: (candle: Candle) => void) {
    const mapped = toYahooSymbol(
      query.ticker,
      query.exchange,
      query.assetClass
    );
    if (!mapped) {
      return this.fallback.subscribe(query, onCandle);
    }

    const pollMs = Number(process.env.MARKET_DATA_POLL_MS ?? 30_000);
    return createYahooPollSubscriber(query, onCandle, pollMs);
  }
}
