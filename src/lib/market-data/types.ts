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
  subscribe?(
    query: CandleQuery,
    onCandle: (candle: Candle) => void
  ): () => void;
}

export function secondsPerBar(tf: Timeframe): number {
  switch (tf) {
    case "tick":
      return 1;
    case "1":
      return 60;
    case "3":
      return 180;
    case "5":
      return 300;
    case "10":
      return 600;
    case "15":
      return 900;
    case "30":
      return 1800;
    case "60":
      return 3600;
    case "120":
      return 7200;
    case "240":
      return 14400;
    case "D":
      return 86400;
    case "W":
      return 604800;
    case "M":
      return 2592000;
  }
}
