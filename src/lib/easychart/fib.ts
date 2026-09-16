import type { Candle } from "@/lib/types";
import { findSwingHighs, findSwingLows } from "@/lib/indicators";
import {
  FIB_TB_RATIOS,
  type EasyDetectOptions,
  type EasyZone,
} from "@/lib/easychart/types";

/**
 * Fib retracement (low→high or high→low) + trend-based extension 0.618/1/1.618.
 * Overlap box when fib levels cluster with S/R prices.
 */
export function detectFibStructures(
  candles: Candle[],
  srLevels: number[] = [],
  opts: EasyDetectOptions = {}
): EasyZone[] {
  if (candles.length < 30) return [];
  const out: EasyZone[] = [];
  const lows = findSwingLows(candles, 3, 3);
  const highs = findSwingHighs(candles, 3, 3);
  if (lows.length < 1 || highs.length < 1) return out;

  const lastLow = lows[lows.length - 1];
  const lastHigh = highs[highs.length - 1];

  // Bullish retracement: swing low → swing high (high after low)
  if (lastHigh > lastLow) {
    const a = candles[lastLow];
    const b = candles[lastHigh];
    const range = b.high - a.low;
    if (range > 0) {
      const levels = [0.382, 0.5, 0.618].map((r) => ({
        ratio: r,
        price: b.high - range * r,
      }));
      out.push({
        id: `fib_ret_bull_${a.time}`,
        kind: "fib",
        bias: "bullish",
        priceTop: b.high,
        priceBottom: a.low,
        startTime: a.time,
        endTime: b.time,
        extendFrom: b.time,
        invalidated: false,
        score: 1,
        barIndex: lastHigh,
        htfOverlap: false,
        touched: false,
        points: [
          { time: a.time, price: a.low },
          { time: b.time, price: b.high },
        ],
        fibLevels: levels,
        meta: { mode: "retracement" },
      });

      // Trend-based extension: A swing start, B impulse end, C pullback end
      const pullback = findPullbackLow(candles, lastHigh);
      if (pullback != null) {
        const c = candles[pullback];
        const ab = b.high - a.low;
        const extLevels = FIB_TB_RATIOS.map((r) => ({
          ratio: r,
          price: c.low + ab * r,
        }));
        out.push({
          id: `fib_ext_bull_${c.time}`,
          kind: "fib_ext",
          bias: "bullish",
          priceTop: Math.max(...extLevels.map((x) => x.price)),
          priceBottom: c.low,
          startTime: a.time,
          endTime: c.time,
          extendFrom: c.time,
          invalidated: false,
          score: 1,
          barIndex: pullback,
          htfOverlap: false,
          touched: false,
          points: [
            { time: a.time, price: a.low },
            { time: b.time, price: b.high },
            { time: c.time, price: c.low },
          ],
          fibLevels: extLevels,
          meta: { mode: "tb_extension" },
        });
      }
    }
  } else if (lastLow > lastHigh) {
    // Bearish retracement high → low
    const a = candles[lastHigh];
    const b = candles[lastLow];
    const range = a.high - b.low;
    if (range > 0) {
      const levels = [0.382, 0.5, 0.618].map((r) => ({
        ratio: r,
        price: b.low + range * r,
      }));
      out.push({
        id: `fib_ret_bear_${a.time}`,
        kind: "fib",
        bias: "bearish",
        priceTop: a.high,
        priceBottom: b.low,
        startTime: a.time,
        endTime: b.time,
        extendFrom: b.time,
        invalidated: false,
        score: 1,
        barIndex: lastLow,
        htfOverlap: false,
        touched: false,
        points: [
          { time: a.time, price: a.high },
          { time: b.time, price: b.low },
        ],
        fibLevels: levels,
        meta: { mode: "retracement" },
      });
    }
  }

  // Overlap boxes: cluster fib levels with S/R
  const prices: { price: number; source: string }[] = [];
  for (const z of out) {
    for (const lv of z.fibLevels ?? []) {
      prices.push({ price: lv.price, source: z.id });
    }
  }
  for (const p of srLevels) prices.push({ price: p, source: "sr" });

  const clusters = clusterPrices(prices, 0.004);
  for (const cl of clusters) {
    if (cl.count < 2) continue;
    const pad = Math.abs(cl.price) * 0.0015;
    out.push({
      id: `overlap_${cl.price.toFixed(2)}`,
      kind: "overlap",
      bias: "neutral",
      priceTop: cl.price + pad,
      priceBottom: cl.price - pad,
      startTime: candles[Math.max(0, candles.length - 40)].time,
      endTime: candles[candles.length - 1].time,
      extendFrom: candles[candles.length - 1].time,
      invalidated: false,
      score: 2,
      barIndex: candles.length - 1,
      htfOverlap: false,
      touched: true,
      meta: { clusterCount: cl.count },
    });
  }

  return out.slice(-(opts.maxZones ?? 10));
}

function findPullbackLow(candles: Candle[], afterHigh: number): number | null {
  let best: number | null = null;
  let bestLow = Infinity;
  for (let i = afterHigh + 1; i < candles.length; i++) {
    if (candles[i].low < bestLow) {
      bestLow = candles[i].low;
      best = i;
    }
    // stop if new high
    if (candles[i].high > candles[afterHigh].high) break;
  }
  return best;
}

function clusterPrices(
  items: { price: number; source: string }[],
  tolFrac: number
): { price: number; count: number }[] {
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const clusters: { price: number; count: number; sources: Set<string> }[] = [];
  for (const it of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(it.price - last.price) / last.price <= tolFrac) {
      last.price = (last.price * last.count + it.price) / (last.count + 1);
      last.count += 1;
      last.sources.add(it.source);
    } else {
      clusters.push({
        price: it.price,
        count: 1,
        sources: new Set([it.source]),
      });
    }
  }
  return clusters
    .map((c) => ({ price: c.price, count: c.sources.size }))
    .filter((c) => c.count >= 2);
}
