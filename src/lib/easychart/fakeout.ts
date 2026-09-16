import type { Candle } from "@/lib/types";
import { findSwingHighs, findSwingLows } from "@/lib/indicators";
import {
  rangeSize,
  wickLower,
  wickUpper,
  type EasyDetectOptions,
  type EasyZone,
} from "@/lib/easychart/types";

/**
 * Fake out: single long wick pierces swing then reclaims (confirmation).
 * Trap: break then double top/bottom reclaim after a delay.
 * Default: confirmation-only (structure reclaim).
 */
export function detectFakeoutTraps(
  candles: Candle[],
  opts: EasyDetectOptions = {}
): EasyZone[] {
  if (candles.length < 25) return [];
  const out: EasyZone[] = [];
  const highs = findSwingHighs(candles, 2, 2);
  const lows = findSwingLows(candles, 2, 2);
  const maxAge = opts.maxAgeBars ?? 40;

  for (let i = 5; i < candles.length - 1; i++) {
    if (candles.length - 1 - i > maxAge) continue;
    const c = candles[i];
    const rng = rangeSize(c);
    const up = wickUpper(c);
    const lo = wickLower(c);

    const nearHigh = highs.some((h) => Math.abs(h - i) <= 2);
    if (nearHigh && up / rng >= 0.55 && c.close < c.high - up * 0.5) {
      const level = c.high;
      const next = candles[i + 1];
      if (next && next.close < c.open) {
        out.push({
          id: `fake_bear_${c.time}`,
          kind: "fakeout",
          bias: "bearish",
          priceTop: level,
          priceBottom: Math.min(c.open, c.close),
          startTime: c.time,
          endTime: next.time,
          extendFrom: next.time,
          invalidated: false,
          score: 2,
          stopPrice: level,
          barIndex: i,
          htfOverlap: false,
          touched: true,
          markerTime: c.time,
          markerPrice: level,
          meta: { confirmed: true },
        });
      }
    }

    const nearLow = lows.some((l) => Math.abs(l - i) <= 2);
    if (nearLow && lo / rng >= 0.55 && c.close > c.low + lo * 0.5) {
      const level = c.low;
      const next = candles[i + 1];
      if (next && next.close > c.open) {
        out.push({
          id: `fake_bull_${c.time}`,
          kind: "fakeout",
          bias: "bullish",
          priceTop: Math.max(c.open, c.close),
          priceBottom: level,
          startTime: c.time,
          endTime: next.time,
          extendFrom: next.time,
          invalidated: false,
          score: 2,
          stopPrice: level,
          barIndex: i,
          htfOverlap: false,
          touched: true,
          markerTime: c.time,
          markerPrice: level,
          meta: { confirmed: true },
        });
      }
    }
  }

  if (highs.length >= 2) {
    const a = highs[highs.length - 2];
    const b = highs[highs.length - 1];
    if (b - a >= 3 && b - a <= 30) {
      const pa = candles[a].high;
      const pb = candles[b].high;
      if (Math.abs(pa - pb) / pa <= 0.008) {
        const mid = candles.slice(a, b).some((x) => x.close > Math.max(pa, pb));
        const reclaim =
          candles[b].close < Math.min(pa, pb) ||
          Boolean(candles[b + 1] && candles[b + 1].close < Math.min(pa, pb));
        if (mid && reclaim) {
          out.push({
            id: `trap_bear_${candles[b].time}`,
            kind: "trap",
            bias: "bearish",
            priceTop: Math.max(pa, pb),
            priceBottom: Math.min(candles[a].close, candles[b].close),
            startTime: candles[a].time,
            endTime: candles[b].time,
            extendFrom: candles[b].time,
            invalidated: false,
            score: 2,
            stopPrice: Math.max(pa, pb),
            barIndex: b,
            htfOverlap: false,
            touched: true,
            markerTime: candles[b].time,
            markerPrice: Math.max(pa, pb),
            meta: { pattern: "double_top" },
          });
        }
      }
    }
  }

  if (lows.length >= 2) {
    const a = lows[lows.length - 2];
    const b = lows[lows.length - 1];
    if (b - a >= 3 && b - a <= 30) {
      const pa = candles[a].low;
      const pb = candles[b].low;
      if (Math.abs(pa - pb) / pa <= 0.008) {
        const mid = candles.slice(a, b).some((x) => x.close < Math.min(pa, pb));
        const reclaim =
          candles[b].close > Math.max(pa, pb) ||
          Boolean(candles[b + 1] && candles[b + 1].close > Math.max(pa, pb));
        if (mid && reclaim) {
          out.push({
            id: `trap_bull_${candles[b].time}`,
            kind: "trap",
            bias: "bullish",
            priceTop: Math.max(candles[a].close, candles[b].close),
            priceBottom: Math.min(pa, pb),
            startTime: candles[a].time,
            endTime: candles[b].time,
            extendFrom: candles[b].time,
            invalidated: false,
            score: 2,
            stopPrice: Math.min(pa, pb),
            barIndex: b,
            htfOverlap: false,
            touched: true,
            markerTime: candles[b].time,
            markerPrice: Math.min(pa, pb),
            meta: { pattern: "double_bottom" },
          });
        }
      }
    }
  }

  return out.slice(-(opts.maxZones ?? 8));
}
