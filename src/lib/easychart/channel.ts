import type { Candle } from "@/lib/types";
import { findSwingHighs, findSwingLows } from "@/lib/indicators";
import { trendPriceAt, detectTrendLines } from "@/lib/easychart/trend";
import type { EasyDetectOptions, EasyZone } from "@/lib/easychart/types";

/**
 * Fully parallel channel + mid dashed.
 * Main trend (wick) + parallel opposite swing wick; mid = 50%.
 */
export function detectChannels(
  candles: Candle[],
  opts: EasyDetectOptions = {}
): EasyZone[] {
  if (candles.length < 30) return [];
  const trends = detectTrendLines(candles, opts);
  const out: EasyZone[] = [];

  for (const trend of trends) {
    if (!trend.points || trend.points.length < 2) continue;
    const [p0, p1] = trend.points;
    const dt = p1.time - p0.time;
    if (dt === 0) continue;
    const slope = (p1.price - p0.price) / dt;

    const swings =
      trend.bias === "bullish"
        ? findSwingHighs(candles, 3, 3)
        : findSwingLows(candles, 3, 3);

    let best: { idx: number; offset: number } | null = null;
    for (const idx of swings) {
      if (candles[idx].time < p0.time || candles[idx].time > p1.time + dt)
        continue;
      const onTrend =
        p0.price + slope * (candles[idx].time - p0.time);
      const wick =
        trend.bias === "bullish" ? candles[idx].high : candles[idx].low;
      const offset = wick - onTrend;
      // bullish channel: highs above trend → positive offset
      if (trend.bias === "bullish" && offset <= 0) continue;
      if (trend.bias === "bearish" && offset >= 0) continue;
      if (
        !best ||
        Math.abs(offset) > Math.abs(best.offset) * 0.85
      ) {
        // prefer recent significant parallel
        if (!best || candles[idx].time >= candles[best.idx].time) {
          best = { idx, offset };
        }
      }
    }
    if (!best) continue;

    const q0 = { time: p0.time, price: p0.price + best.offset };
    const q1 = { time: p1.time, price: p1.price + best.offset };
    const last = candles[candles.length - 1];
    const mainExt = trendPriceAt(trend, last.time) ?? p1.price;
    const parExt = q1.price + slope * (last.time - q1.time);
    const top = Math.max(p0.price, p1.price, mainExt, q0.price, q1.price, parExt);
    const bot = Math.min(p0.price, p1.price, mainExt, q0.price, q1.price, parExt);
    const mid0 = (p0.price + q0.price) / 2;
    const mid1 = (p1.price + q1.price) / 2;

    out.push({
      id: `ch_${trend.bias}_${p0.time}`,
      kind: "channel",
      bias: trend.bias,
      priceTop: top,
      priceBottom: bot,
      startTime: p0.time,
      endTime: p1.time,
      extendFrom: p1.time,
      invalidated: false,
      score: 1,
      barIndex: best.idx,
      htfOverlap: false,
      touched: false,
      points: [p0, p1],
      parallelPoints: [q0, q1],
      meta: {
        mid0,
        mid1,
        offset: best.offset,
        slope,
      },
    });
  }

  return out.slice(-(opts.maxZones ?? 3));
}
