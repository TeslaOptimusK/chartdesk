import type { Candle } from "@/lib/types";

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      const slice = values.slice(i - period + 1, i + 1);
      prev = slice.reduce((a, b) => a + b, 0) / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function rsi(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function bollinger(
  candles: Candle[],
  period = 20,
  mult = 2
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const closes = candles.map((c) => c.close);
  const mid = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null || i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = mid[i]!;
    const variance =
      slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { mid, upper, lower };
}

export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): {
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
} {
  const closes = candles.map((c) => c.close);
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) =>
    fastE[i] == null || slowE[i] == null ? null : fastE[i]! - slowE[i]!
  );
  const macdVals = macdLine.map((v) => v ?? 0);
  const signalRaw = ema(macdVals, signalPeriod);
  const signal: (number | null)[] = macdLine.map((v, i) =>
    v == null || i < slow + signalPeriod - 2 ? null : signalRaw[i]
  );
  const hist: (number | null)[] = macdLine.map((v, i) =>
    v == null || signal[i] == null ? null : v - signal[i]!
  );
  return { macd: macdLine, signal, hist };
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(candles.length).fill(null);
  if (candles.length < 2) return out;
  const trs: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - p.close),
        Math.abs(c.low - p.close)
      )
    );
  }
  let sum = 0;
  for (let i = 1; i < candles.length; i++) {
    sum += trs[i];
    if (i >= period) sum -= trs[i - period];
    if (i >= period) out[i] = sum / period;
  }
  return out;
}

/** Approximate VWAP from cumulative PV / V over the series. */
export function vwap(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = [];
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
    out.push(vol === 0 ? null : pv / vol);
  }
  return out;
}

export function toHeikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen =
      i === 0
        ? (c.open + c.close) / 2
        : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({
      time: c.time,
      open: haOpen,
      high: Math.max(c.high, haOpen, haClose),
      low: Math.min(c.low, haOpen, haClose),
      close: haClose,
      volume: c.volume,
    });
  }
  return out;
}

export function findSwingLows(candles: Candle[], left = 2, right = 2): number[] {
  const idxs: number[] = [];
  for (let i = left; i < candles.length - right; i++) {
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].low <= candles[i].low) {
        isLow = false;
        break;
      }
    }
    if (isLow) idxs.push(i);
  }
  return idxs;
}

export function findSwingHighs(candles: Candle[], left = 2, right = 2): number[] {
  const idxs: number[] = [];
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) idxs.push(i);
  }
  return idxs;
}

export function snapToCandle(
  candles: Candle[],
  time: number,
  price: number
): { time: number; price: number } {
  if (!candles.length) return { time, price };
  let best = candles[0];
  let bestDt = Math.abs(candles[0].time - time);
  for (const c of candles) {
    const dt = Math.abs(c.time - time);
    if (dt < bestDt) {
      best = c;
      bestDt = dt;
    }
  }
  const candidates = [best.open, best.high, best.low, best.close];
  let snapPrice = candidates[0];
  let bestDp = Math.abs(candidates[0] - price);
  for (const p of candidates) {
    const dp = Math.abs(p - price);
    if (dp < bestDp) {
      snapPrice = p;
      bestDp = dp;
    }
  }
  return { time: best.time, price: snapPrice };
}
