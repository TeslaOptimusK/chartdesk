import type { Candle } from "@/lib/types";
import {
  bodyHigh,
  bodyLow,
  bodySize,
  isBearish,
  isBullish,
  isDoji,
  type EasyDetectOptions,
  type EasyZone,
} from "@/lib/easychart/types";

/**
 * Order Block — body-only box (NO wicks in box).
 * Spec: adjacent impulse body ~2x; exclude doji; optional stop = wick extreme.
 */
export function detectOrderBlocks(
  candles: Candle[],
  opts: EasyDetectOptions = {}
): EasyZone[] {
  const minRatio = opts.minBodyRatio ?? 2;
  const maxAge = opts.maxAgeBars ?? 80;
  const out: EasyZone[] = [];
  if (candles.length < 4) return out;

  const lastIdx = candles.length - 1;

  for (let i = 1; i < candles.length - 1; i++) {
    const ob = candles[i];
    const impulse = candles[i + 1];
    if (isDoji(ob) || isDoji(impulse)) continue;

    const obBody = bodySize(ob);
    const impulseBody = bodySize(impulse);
    if (obBody <= 0 || impulseBody < obBody * minRatio) continue;

    // Bullish OB: bearish (or mixed) body before strong bullish impulse
    if (isBearish(ob) && isBullish(impulse)) {
      const top = bodyHigh(ob);
      const bottom = bodyLow(ob);
      if (top <= bottom) continue;
      const stopPrice = Math.min(ob.low, impulse.low);
      const invalidated = isObInvalidated(
        candles,
        i + 2,
        "bullish",
        bottom,
        stopPrice
      );
      const age = lastIdx - i;
      if (age > maxAge && !invalidated) continue;
      const touched = wasTouched(candles, i + 2, top, bottom);
      out.push({
        id: `ob_bull_${ob.time}`,
        kind: "ob",
        bias: "bullish",
        priceTop: top,
        priceBottom: bottom,
        startTime: ob.time,
        endTime: impulse.time,
        extendFrom: impulse.time,
        invalidated,
        score: 1,
        stopPrice,
        barIndex: i,
        htfOverlap: false,
        touched,
        meta: { bodyRatio: impulseBody / obBody },
      });
      continue;
    }

    // Bearish OB: bullish body before strong bearish impulse
    if (isBullish(ob) && isBearish(impulse)) {
      const top = bodyHigh(ob);
      const bottom = bodyLow(ob);
      if (top <= bottom) continue;
      const stopPrice = Math.max(ob.high, impulse.high);
      const invalidated = isObInvalidated(
        candles,
        i + 2,
        "bearish",
        top,
        stopPrice
      );
      const age = lastIdx - i;
      if (age > maxAge && !invalidated) continue;
      const touched = wasTouched(candles, i + 2, top, bottom);
      out.push({
        id: `ob_bear_${ob.time}`,
        kind: "ob",
        bias: "bearish",
        priceTop: top,
        priceBottom: bottom,
        startTime: ob.time,
        endTime: impulse.time,
        extendFrom: impulse.time,
        invalidated,
        score: 1,
        stopPrice,
        barIndex: i,
        htfOverlap: false,
        touched,
        meta: { bodyRatio: impulseBody / obBody },
      });
    }
  }

  // Prefer recent; cap
  const maxZones = opts.maxZones ?? 12;
  return out.slice(-maxZones);
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

/** Invalidate: wick through stop (tight) or close beyond zone edge (loose). */
function isObInvalidated(
  candles: Candle[],
  from: number,
  bias: "bullish" | "bearish",
  zoneEdge: number,
  stopPrice: number
): boolean {
  for (let j = from; j < candles.length; j++) {
    const c = candles[j];
    if (bias === "bullish") {
      if (c.low < stopPrice || c.close < zoneEdge) return true;
    } else {
      if (c.high > stopPrice || c.close > zoneEdge) return true;
    }
  }
  return false;
}

/** Pure helper for tests — body box never uses wick. */
export function orderBlockBodyBox(c: Candle): {
  top: number;
  bottom: number;
} {
  return { top: bodyHigh(c), bottom: bodyLow(c) };
}
