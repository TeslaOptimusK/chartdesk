import type { Candle } from "@/lib/types";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";
import { secondsPerBar } from "@/lib/market-data/types";
import {
  MockMarketDataAdapter,
  generateMockCandles,
} from "@/lib/market-data/mock-adapter";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

type WsCandleMsg = { type: "candle"; payload: Candle };

/**
 * Realtime adapter — WebSocket stub when MARKET_DATA_WS_URL is set,
 * otherwise fast REST poll or mock tick stream.
 */
export class RealtimeMarketDataAdapter implements MarketDataAdapter {
  readonly id = "realtime";
  readonly label = "Realtime (WS / fast poll)";
  readonly mode = "realtime" as const;
  private fallback = new MockMarketDataAdapter();

  async getCandles(query: CandleQuery): Promise<Candle[]> {
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

    const pollMs = Number(process.env.MARKET_DATA_POLL_MS ?? 3000);
    const apiKey = process.env.MARKET_DATA_API_KEY;
    const baseUrl = process.env.MARKET_DATA_BASE_URL;

    if (baseUrl && apiKey) {
      const timer = setInterval(() => {
        void this.getCandles({ ...query, limit: 2 }).then((bars) => {
          const last = bars.at(-1);
          if (last) onCandle(last);
        });
      }, pollMs);
      return () => clearInterval(timer);
    }

    return this.fallback.subscribe(query, (c) => {
      const step = secondsPerBar(query.timeframe);
      const bump = (Math.random() - 0.5) * 0.003;
      onCandle({
        ...c,
        time: Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % step),
        close: round(c.close * (1 + bump)),
        high: round(Math.max(c.high, c.close * (1 + Math.abs(bump)))),
        low: round(Math.min(c.low, c.close * (1 - Math.abs(bump)))),
      });
    });
  }
}
