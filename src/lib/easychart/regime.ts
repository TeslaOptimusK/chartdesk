import type { Candle } from "@/lib/types";
import { sma } from "@/lib/indicators";
import type { EasyDetectOptions, EasyZone } from "@/lib/easychart/types";

/**
 * Daily 365 SMA regime filter — below = scalp-only hint; above after close = swing OK.
 */
export function detectSma365Regime(
  candles: Candle[],
  opts: EasyDetectOptions = {}
): EasyZone[] {
  const period = 365;
  if (candles.length < Math.min(period, 80)) {
    // Fallback: use available length with note when < 365
    const p = Math.min(candles.length - 1, period);
    if (p < 20) return [];
    return buildRegime(candles, p, opts);
  }
  return buildRegime(candles, period, opts);
}

function buildRegime(
  candles: Candle[],
  period: number,
  opts: EasyDetectOptions
): EasyZone[] {
  const closes = candles.map((c) => c.close);
  const series = sma(closes, period);
  const last = candles.length - 1;
  const v = series[last];
  if (v == null) return [];
  const above = candles[last].close > v;
  const confirmed =
    above &&
    candles[last].close > v &&
    (candles[last - 1]?.close ?? 0) <= (series[last - 1] ?? v);

  const points = candles
    .map((c, i) =>
      series[i] != null ? { time: c.time, price: series[i]! } : null
    )
    .filter((p): p is { time: number; price: number } => p != null)
    .slice(-120);

  const zone: EasyZone = {
    id: `sma365_${candles[last].time}`,
    kind: "sma365",
    bias: above ? "bullish" : "bearish",
    priceTop: v,
    priceBottom: v,
    startTime: points[0]?.time ?? candles[0].time,
    endTime: candles[last].time,
    extendFrom: candles[last].time,
    invalidated: false,
    score: 1,
    barIndex: last,
    htfOverlap: false,
    touched: true,
    points,
    meta: {
      period,
      value: v,
      above,
      swingAllowed: above && (confirmed || candles[last].close > v),
      label: above ? "365SMA 위 · 스윙 가능" : "365SMA 아래 · 단타만",
    },
  };
  return [zone].slice(-(opts.maxZones ?? 1));
}
