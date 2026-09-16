import type { Candle } from "@/lib/types";
import { ema, sma, atr, rsi } from "@/lib/indicators";

/** Feature ID: indicator favorites — WMA */
export function wma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - period + 1 + j] * (j + 1);
    }
    out.push(sum / denom);
  }
  return out;
}

/** Feature ID: Stochastic */
export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) continue;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    k[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }
  const kVals = k.map((v) => v ?? 0);
  const dRaw = sma(kVals, dPeriod);
  const d: (number | null)[] = k.map((v, i) =>
    v == null || i < kPeriod + dPeriod - 2 ? null : dRaw[i]
  );
  return { k, d };
}

/**
 * Stochastic RSI — RSI values run through a Stochastic oscillator.
 * Drawn in a dedicated chart pane (not overlaid on price).
 */
export function stochasticRsi(
  candles: Candle[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const rsiVals = rsi(candles, rsiPeriod);
  const stochK: (number | null)[] = Array(candles.length).fill(null);
  for (let i = 0; i < rsiVals.length; i++) {
    if (rsiVals[i] == null || i < rsiPeriod + stochPeriod - 2) continue;
    let hi = -Infinity;
    let lo = Infinity;
    let valid = true;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      if (rsiVals[j] == null) {
        valid = false;
        break;
      }
      hi = Math.max(hi, rsiVals[j]!);
      lo = Math.min(lo, rsiVals[j]!);
    }
    if (!valid) continue;
    const raw = hi === lo ? 50 : ((rsiVals[i]! - lo) / (hi - lo)) * 100;
    stochK[i] = Math.min(100, Math.max(0, raw));
  }
  const kSmoothArr = sma(
    stochK.map((v) => v ?? 0),
    kSmooth
  );
  const k: (number | null)[] = stochK.map((v, i) =>
    v == null ? null : Math.min(100, Math.max(0, kSmoothArr[i] ?? 0))
  );
  const dRaw = sma(
    k.map((v) => v ?? 0),
    dSmooth
  );
  const d: (number | null)[] = k.map((v, i) =>
    v == null ? null : Math.min(100, Math.max(0, dRaw[i] ?? 0))
  );
  return { k, d };
}

/** Feature ID: Ichimoku */
export function ichimoku(
  candles: Candle[],
  tenkan = 9,
  kijun = 26,
  senkou = 52
): {
  tenkan: (number | null)[];
  kijun: (number | null)[];
  spanA: (number | null)[];
  spanB: (number | null)[];
  chikou: (number | null)[];
} {
  const mid = (period: number, i: number) => {
    if (i < period - 1) return null;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    return (hi + lo) / 2;
  };
  const tenkanArr: (number | null)[] = [];
  const kijunArr: (number | null)[] = [];
  const spanA: (number | null)[] = Array(candles.length).fill(null);
  const spanB: (number | null)[] = Array(candles.length).fill(null);
  const chikou: (number | null)[] = Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const t = mid(tenkan, i);
    const k = mid(kijun, i);
    tenkanArr.push(t);
    kijunArr.push(k);
    if (t != null && k != null && i + kijun < candles.length) {
      spanA[i + kijun] = (t + k) / 2;
    }
    const sB = mid(senkou, i);
    if (sB != null && i + kijun < candles.length) {
      spanB[i + kijun] = sB;
    }
    if (i - kijun >= 0) {
      chikou[i - kijun] = candles[i].close;
    }
  }
  return { tenkan: tenkanArr, kijun: kijunArr, spanA, spanB, chikou };
}

/** Feature ID: SuperTrend */
export function supertrend(
  candles: Candle[],
  period = 10,
  mult = 3
): { line: (number | null)[]; dir: (1 | -1 | null)[] } {
  const atrVals = atr(candles, period);
  const line: (number | null)[] = Array(candles.length).fill(null);
  const dir: (1 | -1 | null)[] = Array(candles.length).fill(null);
  let prevUpper = 0;
  let prevLower = 0;
  let prevDir: 1 | -1 = 1;
  let prevLine = 0;

  for (let i = 0; i < candles.length; i++) {
    if (atrVals[i] == null) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    let upper = mid + mult * atrVals[i]!;
    let lower = mid - mult * atrVals[i]!;
    if (i > 0 && atrVals[i - 1] != null) {
      if (lower < prevLower && candles[i - 1].close > prevLower) lower = prevLower;
      if (upper > prevUpper && candles[i - 1].close < prevUpper) upper = prevUpper;
    }
    let d: 1 | -1 = prevDir;
    if (i > 0) {
      if (prevLine === prevUpper) {
        d = candles[i].close > upper ? 1 : -1;
      } else {
        d = candles[i].close < lower ? -1 : 1;
      }
    }
    const st = d === 1 ? lower : upper;
    line[i] = st;
    dir[i] = d;
    prevUpper = upper;
    prevLower = lower;
    prevDir = d;
    prevLine = st;
  }
  return { line, dir };
}

/** Feature ID: draw.vp.fixed_range — volume profile between two times */
export function volumeProfile(
  candles: Candle[],
  fromTime: number,
  toTime: number,
  bins = 24
): { price: number; volume: number }[] {
  const t0 = Math.min(fromTime, toTime);
  const t1 = Math.max(fromTime, toTime);
  const slice = candles.filter((c) => c.time >= t0 && c.time <= t1);
  if (!slice.length) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of slice) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  if (hi <= lo) return [{ price: lo, volume: slice.reduce((a, c) => a + c.volume, 0) }];
  const step = (hi - lo) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    price: lo + (i + 0.5) * step,
    volume: 0,
  }));
  for (const c of slice) {
    const mid = (c.high + c.low) / 2;
    let idx = Math.floor((mid - lo) / step);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    buckets[idx].volume += c.volume;
  }
  return buckets;
}

/** Feature ID: draw.anchored_vwap */
export function anchoredVwap(
  candles: Candle[],
  anchorTime: number
): (number | null)[] {
  const out: (number | null)[] = [];
  let pv = 0;
  let vol = 0;
  let started = false;
  for (const c of candles) {
    if (c.time < anchorTime) {
      out.push(null);
      continue;
    }
    started = true;
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out.push(vol === 0 ? null : pv / vol);
  }
  if (!started) return candles.map(() => null);
  return out;
}

export { ema, sma };
