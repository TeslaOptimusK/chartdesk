import type { Candle, Timeframe } from "@/lib/types";

/** Feature ID: chart.interval.custom — resample OHLCV to N-minute bars */
export function resampleCandles(
  candles: Candle[],
  targetSeconds: number
): Candle[] {
  if (!candles.length || targetSeconds <= 0) return candles;
  const out: Candle[] = [];
  let bucket: Candle | null = null;
  let bucketStart = 0;

  for (const c of candles) {
    const start = c.time - (c.time % targetSeconds);
    if (!bucket || start !== bucketStart) {
      if (bucket) out.push(bucket);
      bucketStart = start;
      bucket = {
        time: start,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      };
    } else {
      bucket.high = Math.max(bucket.high, c.high);
      bucket.low = Math.min(bucket.low, c.low);
      bucket.close = c.close;
      bucket.volume += c.volume;
    }
  }
  if (bucket) out.push(bucket);
  return out;
}

export function timeframeSeconds(tf: Timeframe): number {
  switch (tf) {
    case "tick":
      return 1;
    case "1":
      return 60;
    case "3":
      return 180;
    case "5":
      return 300;
    case "10":
      return 600;
    case "15":
      return 900;
    case "30":
      return 1800;
    case "60":
      return 3600;
    case "120":
      return 7200;
    case "240":
      return 14400;
    case "D":
      return 86400;
    case "W":
      return 604800;
    case "M":
      return 2592000;
  }
}

/** Feature ID: chart.range_preset — visible bar count heuristic */
export function barsForRangePreset(
  preset: "1D" | "5D" | "1M" | "1Y" | "ALL",
  tf: Timeframe
): number | null {
  const sec = timeframeSeconds(tf);
  const day = 86400;
  switch (preset) {
    case "1D":
      return Math.max(20, Math.ceil(day / sec));
    case "5D":
      return Math.max(40, Math.ceil((5 * day) / sec));
    case "1M":
      return Math.max(60, Math.ceil((30 * day) / sec));
    case "1Y":
      return Math.max(120, Math.ceil((365 * day) / sec));
    case "ALL":
      return null;
  }
}

/** Feature ID: chart.date_format */
export function formatChartDate(
  unixSec: number,
  format: "mm/dd/yyyy" | "yyyy-mm-dd" | "dd/mm/yyyy",
  timeZone?: string
): string {
  const d = new Date(unixSec * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  if (format === "yyyy-mm-dd") return `${y}-${m}-${day}`;
  if (format === "dd/mm/yyyy") return `${day}/${m}/${y}`;
  return `${m}/${day}/${y}`;
}

/** Feature ID: scale.countdown — seconds until next bar close */
export function secondsToBarClose(
  nowSec: number,
  lastBarTime: number,
  tf: Timeframe
): number {
  const step = timeframeSeconds(tf);
  const closeAt = lastBarTime + step;
  return Math.max(0, closeAt - nowSec);
}
