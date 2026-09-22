import type { Candle } from "@/lib/types";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";
import {
  MockMarketDataAdapter,
  createFormingBarSubscriber,
  generateMockCandles,
} from "@/lib/market-data/mock-adapter";
import {
  createYahooPollSubscriber,
  fetchYahooCandles,
  toYahooSymbol,
} from "@/lib/market-data/yahoo";

type WsCandleMsg = { type: "candle"; payload: Candle };

/**
 * Realtime adapter — optional WebSocket when MARKET_DATA_WS_URL is set,
 * otherwise Yahoo poll (shared with delayed), then mock forming-bar fallback.
 */
export class RealtimeMarketDataAdapter implements MarketDataAdapter {
  readonly id = "realtime";
  readonly label = "Realtime (Yahoo / WS)";
  readonly mode = "realtime" as const;
  private fallback = new MockMarketDataAdapter();

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    const mapped = toYahooSymbol(
      query.ticker,
      query.exchange,
      query.assetClass
    );
    if (mapped) {
      const bars = await fetchYahooCandles(query);
      if (bars?.length) return bars;
    }

    const baseUrl = process.env.MARKET_DATA_BASE_URL;
    const apiKey = process.env.MARKET_DATA_API_KEY;
    if (baseUrl && apiKey) {
      try {
        const url = new URL("/candles", baseUrl);
        url.searchParams.set("symbol", query.ticker);
        url.searchParams.set("tf", query.timeframe);
        if (query.limit) url.searchParams.set("limit", String(query.limit));
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${apiKey}` },
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as Candle[];
          if (Array.isArray(data) && data.length) return data;
        }
      } catch {
        /* fall through */
      }
    }
    return generateMockCandles(query);
  }

  subscribe(query: CandleQuery, onCandle: (candle: Candle) => void) {
    const wsUrl = process.env.MARKET_DATA_WS_URL?.trim();
    if (wsUrl && typeof WebSocket !== "undefined") {
      let ws: WebSocket | null = null;
      let closed = false;
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as WsCandleMsg;
            if (msg?.type === "candle" && msg.payload) {
              onCandle(msg.payload);
            }
          } catch {
            /* ignore malformed */
          }
        };
        ws.onerror = () => {
          if (!closed) ws?.close();
        };
      } catch {
        ws = null;
      }
      if (ws) {
        return () => {
          closed = true;
          ws?.close();
        };
      }
    }

    const mapped = toYahooSymbol(
      query.ticker,
      query.exchange,
      query.assetClass
    );
    if (mapped) {
      const pollMs = Number(process.env.MARKET_DATA_POLL_MS ?? 3000);
      return createYahooPollSubscriber(query, onCandle, pollMs);
    }

    return createFormingBarSubscriber(query, onCandle, (q) =>
      this.getCandles(q)
    );
  }
}
