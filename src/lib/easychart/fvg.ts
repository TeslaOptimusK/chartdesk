import type { Candle } from "@/lib/types";
import {
  bodySize,
  isBearish,
  isBullish,
  type EasyDetectOptions,
  type EasyZone,
} from "@/lib/easychart/types";

/**
 * Fair Value Gap — 3-candle gap.
 * Middle body must be 2–3× neighbors; similar-size trio ≠ FVG.
 * Discard filled / old gaps.
 */
export function detectFairValueGaps(
  candles: Candle[],
  opts: EasyDetectOptions = {}
): EasyZone[] {
  const minRatio = opts.fvgMiddleMinRatio ?? 2;
  const maxRatio = opts.fvgMiddleMaxRatio ?? 8;
  const maxAge = opts.maxAgeBars ?? 60;
  const out: EasyZone[] = [];
  if (candles.length < 3) return out;

  const lastIdx = candles.length - 1;

  for (let i = 0; i < candles.length - 2; i++) {
    const c1 = candles[i];
    const c2 = candles[i + 1];
    const c3 = candles[i + 2];

    if (!passesMiddleSizeFilter(c1, c2, c3, minRatio, maxRatio)) continue;

    // Bullish FVG: high(1) < low(3), middle long bullish
    if (isBullish(c2) && c1.high < c3.low) {
      const bottom = c1.high;
      const top = c3.low;
      if (top <= bottom) continue;
      const filled = isGapFilled(candles, i + 3, bottom, top, "bullish");
      const age = lastIdx - (i + 2);
      if (filled || age > maxAge) continue;
      const stopPrice = Math.min(c1.low, c2.low, c3.low);
      out.push({
        id: `fvg_bull_${c2.time}`,
        kind: "fvg",
        bias: "bullish",
        priceTop: top,
        priceBottom: bottom,
        startTime: c1.time,
        endTime: c3.time,
        extendFrom: c3.time,
        invalidated: false,
        score: 1,
        stopPrice,
        barIndex: i + 1,
        htfOverlap: false,
        touched: wasTouched(candles, i + 3, top, bottom),
        meta: {
          midRatio: middleRatio(c1, c2, c3),
        },
      });
      continue;
    }

    // Bearish FVG: low(1) > high(3), middle long bearish
    if (isBearish(c2) && c1.low > c3.high) {
      const top = c1.low;
      const bottom = c3.high;
      if (top <= bottom) continue;
      const filled = isGapFilled(candles, i + 3, bottom, top, "bearish");
      const age = lastIdx - (i + 2);
      if (filled || age > maxAge) continue;
      const stopPrice = Math.max(c1.high, c2.high, c3.high);
      out.push({
        id: `fvg_bear_${c2.time}`,
        kind: "fvg",
        bias: "bearish",
        priceTop: top,
        priceBottom: bottom,
        startTime: c1.time,
        endTime: c3.time,
        extendFrom: c3.time,
        invalidated: false,
        score: 1,
        stopPrice,
        barIndex: i + 1,
        htfOverlap: false,
        touched: wasTouched(candles, i + 3, top, bottom),
        meta: {
          midRatio: middleRatio(c1, c2, c3),
        },
      });
    }
  }

  return out.slice(-(opts.maxZones ?? 12));
}

/** Middle body ≥ minRatio × max(neighbor bodies); reject similar-size trio. */
export function passesMiddleSizeFilter(
  c1: Candle,
  c2: Candle,
  c3: Candle,
  minRatio = 2,
  maxRatio = 8
): boolean {
  const b1 = bodySize(c1);
  const b2 = bodySize(c2);
  const b3 = bodySize(c3);
  const neighborMax = Math.max(b1, b3, 1e-12);

  // Similar-size three candles → NOT FVG (spec)
  const maxAll = Math.max(b1, b2, b3, 1e-12);
  const minAll = Math.min(
    Math.max(b1, 1e-12),
    Math.max(b2, 1e-12),
    Math.max(b3, 1e-12)
  );
  if (maxAll / minAll < minRatio) return false;

  const ratio = b2 / neighborMax;
  return ratio >= minRatio && ratio <= maxRatio;
}

export function middleRatio(c1: Candle, c2: Candle, c3: Candle): number {
  const neighborMax = Math.max(bodySize(c1), bodySize(c3), 1e-12);
  return bodySize(c2) / neighborMax;
}

function wasTouched(
  candles: Candle[],
  from: number,
  top: number,
  bottom: number
): boolean {
  for (let j = from; j < candles.length; j++) {
    const c = candles[j];
    if (c.low <= top && c.high >= bottom) return true;
  }
  return false;
}

function isGapFilled(
  candles: Candle[],
  from: number,
  bottom: number,
  top: number,
  bias: "bullish" | "bearish"
): boolean {
  for (let j = from; j < candles.length; j++) {
    const c = candles[j];
    if (bias === "bullish" && c.low <= bottom) return true;
    if (bias === "bearish" && c.high >= top) return true;
  }
  return false;
}
