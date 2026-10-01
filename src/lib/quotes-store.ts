import { create } from "zustand";
import type { SessionQuoteView } from "@/lib/session-quote";
import type { Candle } from "@/lib/types";

export interface LiveQuote {
  symbolId: string;
  last: number;
  prevClose: number;
  /** Percent change vs prevClose */
  changePct: number;
  /** Forming / last bar unix time */
  barTime: number;
  updatedAt: number;
  /** Official close line and pre-market line. Null until the session quote arrives. */
  session: SessionQuoteView | null;
  /** Set when the print came from Upbit, Bithumb, Binance, or Bybit. */
  quoteCcy?: "KRW" | "USDT";
}

interface QuotesState {
  quotes: Record<string, LiveQuote>;
  /** Seed or refresh from a candle series (last vs prior bar close). */
  setFromCandles: (symbolId: string, candles: Candle[]) => void;
  /** Apply a live forming-bar tick. */
  setFromTick: (symbolId: string, candle: Candle) => void;
  /** Replace the percent base with the previous session close. */
  setSessionQuote: (symbolId: string, session: SessionQuoteView) => void;
  setVenueQuote: (
    symbolId: string,
    quote: { price: number; changePct: number; ccy: "KRW" | "USDT" }
  ) => void;
  clearQuote: (symbolId: string) => void;
}

function pct(last: number, prevClose: number): number {
  if (!prevClose || !Number.isFinite(prevClose) || prevClose === 0) return 0;
  return ((last - prevClose) / prevClose) * 100;
}

export const useQuotesStore = create<QuotesState>((set, get) => ({
  quotes: {},

  setFromCandles: (symbolId, candles) => {
    if (!candles.length) return;
    const prevQuote = get().quotes[symbolId];
    const lastBar = candles[candles.length - 1]!;
    if (prevQuote?.session?.priceKind === "close") {
      set({
        quotes: {
          ...get().quotes,
          [symbolId]: { ...prevQuote, barTime: lastBar.time },
        },
      });
      return;
    }
    if (prevQuote?.session?.priceKind === "live") {
      const base = prevQuote.session.changeBase;
      set({
        quotes: {
          ...get().quotes,
          [symbolId]: {
            ...prevQuote,
            last: lastBar.close,
            prevClose: base,
            changePct: pct(lastBar.close, base),
            barTime: lastBar.time,
            updatedAt: Date.now(),
          },
        },
      });
      return;
    }
    const prevBar = candles.length > 1 ? candles[candles.length - 2]! : null;
    const prevClose = prevBar?.close ?? lastBar.open;
    const last = lastBar.close;
    set({
      quotes: {
        ...get().quotes,
        [symbolId]: {
          symbolId,
          last,
          prevClose,
          changePct: pct(last, prevClose),
          barTime: lastBar.time,
          updatedAt: Date.now(),
          session: null,
        },
      },
    });
  },

  setFromTick: (symbolId, candle) => {
    const prev = get().quotes[symbolId];
    if (prev?.session?.priceKind === "close") return;
    if (prev?.session?.priceKind === "live") {
      const base = prev.session.changeBase;
      set({
        quotes: {
          ...get().quotes,
          [symbolId]: {
            ...prev,
            last: candle.close,
            prevClose: base,
            changePct: pct(candle.close, base),
            barTime: candle.time,
            updatedAt: Date.now(),
          },
        },
      });
      return;
    }
    let prevClose = candle.open;
    if (prev) {
      if (prev.barTime === candle.time) {
        prevClose = prev.prevClose;
      } else {
        // New bar — previous last becomes the reference close.
        prevClose = prev.last;
      }
    }
    const last = candle.close;
    set({
      quotes: {
        ...get().quotes,
        [symbolId]: {
          symbolId,
          last,
          prevClose,
          changePct: pct(last, prevClose),
          barTime: candle.time,
          updatedAt: Date.now(),
          session: prev?.session ?? null,
        },
      },
    });
  },

  setVenueQuote: (symbolId, quote) => {
    const prev = get().quotes[symbolId];
    const base =
      quote.changePct === 0 ? quote.price : quote.price / (1 + quote.changePct / 100);
    set({
      quotes: {
        ...get().quotes,
        [symbolId]: {
          symbolId,
          last: quote.price,
          prevClose: base,
          changePct: quote.changePct,
          barTime: prev?.barTime ?? 0,
          updatedAt: Date.now(),
          quoteCcy: quote.ccy,
          session: {
            phase: "always",
            displayPrice: quote.price,
            changeBase: base,
            changePct: quote.changePct,
            closeLine: null,
            preLine: null,
            priceKind: "live",
          },
        },
      },
    });
  },

  setSessionQuote: (symbolId, session) => {
    const prev = get().quotes[symbolId];
    const keepLive = session.priceKind === "live" && prev?.session?.priceKind === "live";
    const last = keepLive ? prev.last : session.displayPrice;
    set({
      quotes: {
        ...get().quotes,
        [symbolId]: {
          symbolId,
          last,
          prevClose: session.changeBase,
          changePct: pct(last, session.changeBase),
          barTime: prev?.barTime ?? 0,
          updatedAt: prev?.updatedAt ?? Date.now(),
          session,
        },
      },
    });
  },

  clearQuote: (symbolId) => {
    const next = { ...get().quotes };
    delete next[symbolId];
    set({ quotes: next });
  },
}));

const chartQuoteOwners = new Map<string, number>();

/** Chart pane owns this symbol's quote so the watchlist SSE cannot overwrite it. */
export function retainChartQuote(symbolId: string): () => void {
  chartQuoteOwners.set(symbolId, (chartQuoteOwners.get(symbolId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const n = (chartQuoteOwners.get(symbolId) ?? 1) - 1;
    if (n <= 0) chartQuoteOwners.delete(symbolId);
    else chartQuoteOwners.set(symbolId, n);
  };
}

export function isChartQuoteOwner(symbolId: string): boolean {
  return (chartQuoteOwners.get(symbolId) ?? 0) > 0;
}

export function formatQuotePrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  // Whole-won prints (KRX mock) should not show bogus cents.
  if (abs >= 1000 && Math.abs(n - Math.round(n)) < 1e-6) {
    return Math.round(n).toString();
  }
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function formatChangePct(pctVal: number): string {
  if (!Number.isFinite(pctVal)) return "—";
  const sign = pctVal >= 0 ? "+" : "";
  return `${sign}${pctVal.toFixed(3)}%`;
}
