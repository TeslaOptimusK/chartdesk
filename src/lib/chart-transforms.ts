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
