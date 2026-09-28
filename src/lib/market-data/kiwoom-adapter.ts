import type { Candle } from "@/lib/types";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";
import { fetchKiwoomCandles } from "@/lib/kiwoom/quote-rest";
import {
  foldTickIntoBar,
  mergeSeedBar,
  toKiwoomCode,
  type KiwoomTick,
} from "@/lib/kiwoom/quote-protocol";
import { getKiwoomQuoteHub, type KiwoomQuoteHub } from "@/lib/kiwoom/quote-hub";

interface BarSession {
  forming: Candle | null;
  listeners: Set<(candle: Candle) => void>;
  unsubHub: (() => void) | null;
  fallbackUnsub: (() => void) | null;
}

const sessions = new Map<string, BarSession>();

function emit(session: BarSession, candle: Candle) {
  const snap = { ...candle };
  for (const fn of session.listeners) fn(snap);
}

/**
 * Korean 6-digit names use Kiwoom REST history + 0B websocket ticks.
 * Everything else stays on the wrapped adapter (Yahoo or mock).
 */
export class KiwoomRoutedMarketDataAdapter implements MarketDataAdapter {
  readonly id = "kiwoom";
  readonly label = "키움 실시간";
  readonly mode = "realtime" as const;

  constructor(
    private fallback: MarketDataAdapter,
    private hub: KiwoomQuoteHub = getKiwoomQuoteHub()
  ) {}

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    const code = toKiwoomCode(query.ticker, query.exchange, query.assetClass);
    if (!code) return this.fallback.getCandles(query);
    try {
      const bars = await fetchKiwoomCandles(code, query);
      if (bars.length) return bars;
    } catch (err) {
      const detail = err instanceof Error ? err.message : "chart error";
      console.warn(`[kiwoom] 차트 조회 실패, 기존 시세로 대체 (${detail})`);
    }
    return this.fallback.getCandles(query);
  }

  subscribe(query: CandleQuery, onCandle: (candle: Candle) => void): () => void {
    const code = toKiwoomCode(query.ticker, query.exchange, query.assetClass);
    if (!code) {
      return this.fallback.subscribe?.(query, onCandle) ?? (() => undefined);
    }

    const key = `${code}|${query.timeframe}`;
    let session = sessions.get(key);
    if (!session) {
      session = {
        forming: null,
        listeners: new Set(),
        unsubHub: null,
        fallbackUnsub: null,
      };
      sessions.set(key, session);
      const current = session;
      current.unsubHub = this.hub.subscribe(code, (tick: KiwoomTick) => {
        if (sessions.get(key) !== current) return;
        current.forming = foldTickIntoBar(current.forming, tick, query.timeframe);
        emit(current, current.forming);
      });
      void fetchKiwoomCandles(code, { ...query, limit: 2 })
        .then((bars) => {
          if (sessions.get(key) !== current) return;
          current.forming = mergeSeedBar(bars.at(-1) ?? null, current.forming);
          if (current.forming) emit(current, current.forming);
        })
        .catch(() => undefined);
      void this.hub.whenLoggedIn(12_000).then((ok) => {
        if (sessions.get(key) !== current || ok || current.fallbackUnsub) return;
        if (current.unsubHub) {
          current.unsubHub();
          current.unsubHub = null;
        }
        current.fallbackUnsub =
          this.fallback.subscribe?.(query, (candle) => {
            if (sessions.get(key) !== current) return;
            current.forming = candle;
            emit(current, candle);
          }) ?? null;
      });
    }

    session.listeners.add(onCandle);
    if (session.forming) onCandle({ ...session.forming });

    return () => {
      const current = sessions.get(key);
      if (!current) return;
      current.listeners.delete(onCandle);
      if (current.listeners.size > 0) return;
      current.unsubHub?.();
      current.fallbackUnsub?.();
      sessions.delete(key);
    };
  }
}

export function resetKiwoomBarSessionsForTests(): void {
  for (const session of sessions.values()) {
    session.unsubHub?.();
    session.fallbackUnsub?.();
  }
  sessions.clear();
}
