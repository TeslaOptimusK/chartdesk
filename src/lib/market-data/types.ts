import type { Candle, Timeframe } from "@/lib/types";

export interface CandleQuery {
  symbolId: string;
  ticker: string;
  timeframe: Timeframe;
  from?: number;
  to?: number;
  limit?: number;
}

export interface MarketDataAdapter {
  readonly id: string;
  readonly label: string;
  readonly mode: "mock" | "delayed" | "realtime";
  getCandles(query: CandleQuery): Promise<Candle[]>;
  /** Ready for realtime vendors; mock/delayed may no-op or poll. */
  subscribe?(
    query: CandleQuery,
    onCandle: (candle: Candle) => void
  ): () => void;
}

export function secondsPerBar(tf: Timeframe): number {
  switch (tf) {
    case "1":
      return 60;
    case "5":
      return 300;
    case "15":
      return 900;
    case "60":
      return 3600;
    case "240":
      return 14400;
    case "D":
      return 86400;
  }
}
