import type { Candle } from "@/lib/types";

/** Feature IDs: chart.type.renko | kagi | line_break | point_figure | range */
export interface TransformOptions {
  brickSize?: number;
  reversal?: number;
  lineBreakCount?: number;
  rangeSize?: number;
}

function avgRange(candles: Candle[], n = 14): number {
  const tail = candles.slice(-Math.min(n, candles.length));
  if (!tail.length) return 1;
  const sum = tail.reduce((a, c) => a + (c.high - c.low), 0);
  return sum / tail.length || 1;
}

function defaultBrick(candles: Candle[]): number {
  const r = avgRange(candles);
  const mid = candles[candles.length - 1]?.close ?? 100;
  return Math.max(r, mid * 0.005);
}

/** chart.type.renko */
export function toRenko(candles: Candle[], opts: TransformOptions = {}): Candle[] {
  if (candles.length === 0) return [];
  const brick = opts.brickSize ?? defaultBrick(candles);
  const out: Candle[] = [];
  let lastClose = candles[0].close;
  let t = candles[0].time;
  for (const c of candles) {
    t = c.time;
    let price = c.close;
    while (price >= lastClose + brick) {
      lastClose += brick;
      out.push({
        time: t,
        open: lastClose - brick,
        high: lastClose,
        low: lastClose - brick,
        close: lastClose,
        volume: c.volume,
      });
    }
    while (price <= lastClose - brick) {
      lastClose -= brick;
      out.push({
        time: t,
        open: lastClose + brick,
        high: lastClose + brick,
        low: lastClose,
        close: lastClose,
        volume: c.volume,
      });
    }
  }
  return out.length ? out : candles.slice(-1);
}

/** chart.type.kagi */
export function toKagi(candles: Candle[], opts: TransformOptions = {}): Candle[] {
  if (candles.length === 0) return [];
  const rev = opts.reversal ?? defaultBrick(candles);
  const out: Candle[] = [];
  let dir: "up" | "down" = "up";
  let pivot = candles[0].close;
  let extreme = pivot;
  let t = candles[0].time;
  for (const c of candles) {
    t = c.time;
    const price = c.close;
    if (dir === "up") {
      if (price > extreme) extreme = price;
      if (extreme - price >= rev) {
        out.push({
          time: t,
          open: extreme,
          high: extreme,
          low: price,
          close: price,
          volume: c.volume,
        });
        dir = "down";
        pivot = price;
        extreme = price;
      }
    } else {
      if (price < extreme) extreme = price;
      if (price - extreme >= rev) {
        out.push({
          time: t,
          open: extreme,
          high: price,
          low: extreme,
          close: price,
          volume: c.volume,
        });
        dir = "up";
        pivot = price;
        extreme = price;
      }
    }
  }
  if (!out.length) {
    return [
      {
        time: t,
        open: pivot,
        high: pivot,
        low: pivot,
        close: pivot,
        volume: candles[candles.length - 1].volume,
      },
    ];
  }
  return out;
}

/** chart.type.line_break */
export function toLineBreak(
  candles: Candle[],
  opts: TransformOptions = {}
): Candle[] {
  const n = opts.lineBreakCount ?? 3;
  if (candles.length <= n) return candles;
  const out: Candle[] = [];
  for (let i = n; i < candles.length; i++) {
    const ref = candles[i - n];
    const cur = candles[i];
    const up = cur.close > ref.high;
    const down = cur.close < ref.low;
    if (!up && !down) continue;
    out.push({
      time: cur.time,
      open: ref.close,
      high: up ? cur.close : ref.close,
      low: down ? cur.close : ref.close,
      close: cur.close,
      volume: cur.volume,
    });
  }
  return out.length ? out : candles;
}

/** chart.type.point_figure */
export function toPointFigure(
  candles: Candle[],
  opts: TransformOptions = {}
): Candle[] {
  const box = opts.brickSize ?? defaultBrick(candles) * 0.5;
  const rev = opts.reversal ?? 3;
  if (!candles.length) return [];
  const out: Candle[] = [];
  let col = 0;
  let dir: "X" | "O" = "X";
  let top = candles[0].close;
  let bottom = top - box;
  let t = candles[0].time;
  for (const c of candles) {
    t = c.time;
    let price = c.close;
    if (dir === "X") {
      while (price >= top + box) {
        top += box;
        bottom = top - box;
        col += 1;
        out.push({
          time: t + col,
          open: bottom,
          high: top,
          low: bottom,
          close: top,
          volume: c.volume,
        });
      }
      if (top - price >= rev * box) {
        dir = "O";
        bottom = top - box;
        top = bottom;
        while (price <= bottom - box) {
          bottom -= box;
          top = bottom + box;
          col += 1;
          out.push({
            time: t + col,
            open: top,
            high: top,
            low: bottom,
            close: bottom,
            volume: c.volume,
          });
        }
      }
    } else {
      while (price <= bottom - box) {
        bottom -= box;
        top = bottom + box;
        col += 1;
        out.push({
          time: t + col,
          open: top,
          high: top,
          low: bottom,
          close: bottom,
          volume: c.volume,
        });
      }
      if (price - top >= rev * box) {
        dir = "X";
        top = bottom + box;
        bottom = top - box;
        while (price >= top + box) {
          top += box;
          bottom = top - box;
          col += 1;
          out.push({
            time: t + col,
            open: bottom,
            high: top,
            low: bottom,
            close: top,
            volume: c.volume,
          });
        }
      }
    }
  }
  return out.length ? out : candles.slice(-20);
}

/** chart.type.range */
export function toRangeBars(
  candles: Candle[],
  opts: TransformOptions = {}
): Candle[] {
  const range = opts.rangeSize ?? defaultBrick(candles);
  if (!candles.length) return [];
  const out: Candle[] = [];
  let bucket: Candle | null = null;
  for (const c of candles) {
    if (!bucket) {
      bucket = { ...c };
      continue;
    }
    bucket.high = Math.max(bucket.high, c.high);
    bucket.low = Math.min(bucket.low, c.low);
    bucket.close = c.close;
    bucket.volume += c.volume;
    bucket.time = c.time;
    if (bucket.high - bucket.low >= range) {
      out.push(bucket);
      bucket = null;
    }
  }
  if (bucket) out.push(bucket);
  return out.length ? out : candles;
}

/** chart.type.volume_candles — volume percentile for coloring (0–1) */
export function volumeIntensity(candles: Candle[]): number[] {
  const vols = candles.map((c) => c.volume);
  const sorted = [...vols].sort((a, b) => a - b);
  return vols.map((v) => {
    const idx = sorted.findIndex((x) => x >= v);
    const rank = idx < 0 ? sorted.length - 1 : idx;
    return sorted.length <= 1 ? 0.5 : rank / (sorted.length - 1);
  });
}

export function applyChartTransform(
  style: string,
  candles: Candle[],
  opts?: TransformOptions
): Candle[] {
  switch (style) {
    case "renko":
      return toRenko(candles, opts);
    case "kagi":
      return toKagi(candles, opts);
    case "line_break":
      return toLineBreak(candles, opts);
    case "point_figure":
      return toPointFigure(candles, opts);
    case "range":
      return toRangeBars(candles, opts);
    default:
      return candles;
  }
}

/** Feature ID: chart.interval.tick — synthetic sub-bar ticks from OHLCV (mock) */
export function candlesToSyntheticTicks(
  candles: Candle[],
  ticksPerBar = 12
): Candle[] {
  if (!candles.length) return [];
  const out: Candle[] = [];
  for (let bi = 0; bi < candles.length; bi++) {
    const c = candles[bi];
    const nextTime = candles[bi + 1]?.time ?? c.time + 60;
    const span = Math.max(1, nextTime - c.time);
    const step = Math.max(1, Math.floor(span / ticksPerBar));
    let price = c.open;
    for (let i = 0; i < ticksPerBar; i++) {
      const t = c.time + i * step;
      if (t >= nextTime) break;
      const target =
        i === ticksPerBar - 1
          ? c.close
          : c.open + ((c.close - c.open) * (i + 1)) / ticksPerBar;
      const wiggle =
        (Math.sin((bi + 1) * (i + 2) * 0.7) * (c.high - c.low)) / 6;
      const close = Math.min(c.high, Math.max(c.low, target + wiggle));
      const open = price;
      const high = Math.max(open, close, Math.min(c.high, close + wiggle * 0.3));
      const low = Math.min(open, close, Math.max(c.low, close - wiggle * 0.3));
      const volSlice = Math.floor(c.volume / ticksPerBar);
      out.push({
        time: t,
        open: round2(open),
        high: round2(high),
        low: round2(low),
        close: round2(close),
        volume: volSlice + (i === 0 ? c.volume % ticksPerBar : 0),
      });
      price = close;
    }
  }
  return out.length ? out : candles;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Feature ID: chart.type.volume_footprint — mock bid/ask bins per bar */
export interface FootprintLevel {
  price: number;
  bidVol: number;
  askVol: number;
}

export interface FootprintBar {
  time: number;
  levels: FootprintLevel[];
}

export function mockFootprintBars(
  candles: Candle[],
  levelsPerBar = 14
): FootprintBar[] {
  return candles.map((c, idx) => {
    const range = Math.max(c.high - c.low, c.close * 0.0005, 0.01);
    const step = range / levelsPerBar;
    const base = c.low;
    const up = c.close >= c.open;
    const levels: FootprintLevel[] = [];
    for (let i = 0; i < levelsPerBar; i++) {
      const price = round2(base + step * (i + 0.5));
      const seed = Math.sin((idx + 1) * (i + 3) * 1.31) * 0.5 + 0.5;
      const total = Math.floor((c.volume / levelsPerBar) * (0.6 + seed));
      const askShare = up ? 0.55 + seed * 0.25 : 0.35 + seed * 0.2;
      const askVol = Math.floor(total * askShare);
      levels.push({
        price,
        bidVol: total - askVol,
        askVol,
      });
    }
    return { time: c.time, levels };
  });
}

/** Feature ID: chart.type.tpo — mock TPO letters per price level (session profile) */
export interface TpoLevel {
  price: number;
  letters: string;
}

export function mockTpoProfile(
  candles: Candle[],
  levels = 32
): TpoLevel[] {
  if (!candles.length) return [];
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const span = Math.max(hi - lo, 0.01);
  const step = span / levels;
  const buckets = new Map<number, string[]>();
  const periodLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const barsPerPeriod = Math.max(1, Math.floor(candles.length / periodLetters.length));

  candles.forEach((c, barIdx) => {
    const periodIdx = Math.floor(barIdx / barsPerPeriod) % periodLetters.length;
    const letter = periodLetters[periodIdx] ?? "A";
    const touchLow = Math.floor((c.low - lo) / step);
    const touchHigh = Math.floor((c.high - lo) / step);
    for (let b = touchLow; b <= touchHigh; b++) {
      const price = round2(lo + step * (b + 0.5));
      const arr = buckets.get(price) ?? [];
      if (!arr.includes(letter)) arr.push(letter);
      buckets.set(price, arr);
    }
  });

  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([price, letters]) => ({
      price,
      letters: letters.join(""),
    }));
}
