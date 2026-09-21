import { create } from "zustand";
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
}

interface QuotesState {
  quotes: Record<string, LiveQuote>;
  /** Seed or refresh from a candle series (last vs prior bar close). */
  setFromCandles: (symbolId: string, candles: Candle[]) => void;
  /** Apply a live forming-bar tick. */
  setFromTick: (symbolId: string, candle: Candle) => void;
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
    const lastBar = candles[candles.length - 1]!;
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
        },
      },
    });
  },

  setFromTick: (symbolId, candle) => {
    const prev = get().quotes[symbolId];
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

export function formatQuotePrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(2);
  if (abs >= 100) return n.toFixed(2);
  if (abs >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function formatChangePct(pctVal: number): string {
  if (!Number.isFinite(pctVal)) return "—";
  const sign = pctVal >= 0 ? "+" : "";
  return `${sign}${pctVal.toFixed(3)}%`;
}
