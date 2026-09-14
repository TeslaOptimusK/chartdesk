import type { Candle } from "@/lib/types";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";
import { secondsPerBar } from "@/lib/market-data/types";

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function basePrice(ticker: string): number {
  if (ticker.includes("BTC")) return 68000;
  if (ticker.includes("ETH")) return 3400;
  if (ticker === "005930") return 78000;
  if (ticker === "000660") return 185000;
  if (ticker === "AAPL") return 190;
  if (ticker === "NVDA") return 120;
  if (ticker === "TSLA") return 250;
  return 100 + (hashSeed(ticker) % 400);
}

/** Deterministic OHLCV generator so the app runs without API keys. */
export function generateMockCandles(query: CandleQuery): Candle[] {
  const limit = query.limit ?? 180;
  const step = secondsPerBar(query.timeframe);
  const end = query.to ?? Math.floor(Date.now() / 1000);
  const alignedEnd = end - (end % step);
  const start =
    query.from ?? alignedEnd - step * (limit - 1);
  const rand = mulberry32(hashSeed(`${query.symbolId}:${query.timeframe}`));
  let price = basePrice(query.ticker);
  const candles: Candle[] = [];

  for (let t = start; t <= alignedEnd; t += step) {
    const drift = (rand() - 0.48) * price * 0.012;
    const open = price;
    const close = Math.max(0.01, open + drift);
    const wick = Math.abs(drift) * (0.4 + rand());
    const high = Math.max(open, close) + wick * rand();
    const low = Math.min(open, close) - wick * rand();
    const volume = Math.floor(800_000 + rand() * 2_500_000);
    candles.push({
      time: t,
      open: round(open),
      high: round(high),
      low: round(Math.max(0.01, low)),
      close: round(close),
      volume,
    });
    price = close;
  }
  return candles;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export class MockMarketDataAdapter implements MarketDataAdapter {
  readonly id = "mock";
  readonly label = "Mock (offline)";
  readonly mode = "mock" as const;

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    return generateMockCandles(query);
  }

  subscribe(query: CandleQuery, onCandle: (candle: Candle) => void) {
    const step = secondsPerBar(query.timeframe);
    const interval = setInterval(async () => {
      const bars = await this.getCandles({ ...query, limit: 1 });
      const last = bars[bars.length - 1];
      if (last) {
        onCandle({
          ...last,
          time: Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % step),
          close: round(last.close * (1 + (Math.random() - 0.5) * 0.002)),
        });
      }
    }, Math.min(step * 1000, 15_000));
    return () => clearInterval(interval);
  }
}
