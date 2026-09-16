import type { Candle } from "@/lib/types";
import { findSwingHighs, findSwingLows } from "@/lib/indicators";
import type { EasyDetectOptions, EasyZone } from "@/lib/easychart/types";

/**
 * Trend line — wick-based only (no body). Extend right.
 * Bullish: swing lows; bearish: swing highs.
 */
export function detectTrendLines(
  candles: Candle[],
  opts: EasyDetectOptions = {}
): EasyZone[] {
  if (candles.length < 20) return [];
  const out: EasyZone[] = [];
  const lows = findSwingLows(candles, 3, 3);
  const highs = findSwingHighs(candles, 3, 3);

  const bull = pickTrendPair(candles, lows, "bullish");
  if (bull) out.push(bull);
  const bear = pickTrendPair(candles, highs, "bearish");
  if (bear) out.push(bear);

  return out.slice(-(opts.maxZones ?? 4));
}

function pickTrendPair(
  candles: Candle[],
  swings: number[],
  bias: "bullish" | "bearish"
): EasyZone | null {
  if (swings.length < 2) return null;
  // Prefer last two meaningful swings with enough spacing
  for (let j = swings.length - 1; j >= 1; j--) {
    for (let i = j - 1; i >= 0; i--) {
      const a = swings[i];
      const b = swings[j];
      if (b - a < 5) continue;
      const pa = bias === "bullish" ? candles[a].low : candles[a].high;
      const pb = bias === "bullish" ? candles[b].low : candles[b].high;
      const dt = candles[b].time - candles[a].time;
      if (dt <= 0) continue;
      const slope = (pb - pa) / dt;
      // Extreme angle filter (too flat / too steep in price-per-bar terms)
      const bars = b - a;
      const barSlope = (pb - pa) / bars;
      const mid = (pa + pb) / 2 || 1;
      const angleFrac = Math.abs(barSlope) / mid;
      if (angleFrac < 0.00005 || angleFrac > 0.08) continue;

      // Rising lows / falling highs
      if (bias === "bullish" && !(pb >= pa * 0.998)) continue;
      if (bias === "bearish" && !(pb <= pa * 1.002)) continue;

      const last = candles[candles.length - 1];
      const proj = pb + slope * (last.time - candles[b].time);
      const band = Math.abs(pb - pa) * 0.15 + mid * 0.002;

      return {
        id: `trend_${bias}_${candles[a].time}`,
        kind: "trend",
        bias,
        priceTop: Math.max(pa, pb, proj) + band,
        priceBottom: Math.min(pa, pb, proj) - band,
        startTime: candles[a].time,
        endTime: candles[b].time,
        extendFrom: candles[b].time,
        invalidated: false,
        score: 1,
        barIndex: b,
        htfOverlap: false,
        touched: false,
        points: [
          { time: candles[a].time, price: pa },
          { time: candles[b].time, price: pb },
        ],
        meta: { slope, angleFrac },
      };
    }
  }
  return null;
}

/** Price on extended trend at time t */
export function trendPriceAt(
  z: EasyZone,
  time: number
): number | null {
  if (!z.points || z.points.length < 2) return null;
  const [a, b] = z.points;
  const dt = b.time - a.time;
  if (dt === 0) return b.price;
  const slope = (b.price - a.price) / dt;
  return b.price + slope * (time - b.time);
}
