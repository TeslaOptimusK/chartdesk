import type { Candle } from "@/lib/types";
import { fetchVenueCandles } from "@/lib/crypto-venue";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";

/**
 * Crypto charts follow the exchange on the symbol.
 * Stocks and anything without a venue book stay on the wrapped adapter.
 */
export class CryptoVenueMarketDataAdapter implements MarketDataAdapter {
  readonly id = "crypto-venue";
  readonly label = "거래소 시세";
  readonly mode = "realtime" as const;

  constructor(private fallback: MarketDataAdapter) {}

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    if (query.assetClass === "crypto") {
      const bars = await fetchVenueCandles(
        query.exchange,
        query.ticker,
        query.timeframe,
        query.limit ?? 200
      );
      if (bars?.length) return bars;
    }
    return this.fallback.getCandles(query);
  }

  subscribe(query: CandleQuery, onCandle: (candle: Candle) => void): () => void {
    if (query.assetClass !== "crypto" || !this.fallback.subscribe) {
      return this.fallback.subscribe?.(query, onCandle) ?? (() => undefined);
    }
    let stopped = false;
    const pull = async () => {
      const bars = await fetchVenueCandles(query.exchange, query.ticker, query.timeframe, 2);
      const last = bars?.at(-1);
      if (!stopped && last) onCandle(last);
    };
    void pull();
    const timer = setInterval(() => void pull(), 8_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }
}
