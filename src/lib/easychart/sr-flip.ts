import type { Candle } from "@/lib/types";
import { findSwingHighs, findSwingLows } from "@/lib/indicators";
import type { EasyDetectOptions, EasyZone } from "@/lib/easychart/types";

/**
 * S/R Flip — horizontal ray on swing wick after break (role flip).
 */
export function detectSrFlips(
  candles: Candle[],
  opts: EasyDetectOptions = {}
): EasyZone[] {
  if (candles.length < 20) return [];
  const out: EasyZone[] = [];
  const highs = findSwingHighs(candles, 3, 3);
  const lows = findSwingLows(candles, 3, 3);
  const last = candles[candles.length - 1];

  for (const h of highs.slice(-6)) {
    const level = candles[h].high; // wick
    // Break above then close back / trade as resistance after flip from support break
    let broken = false;
    let flipped = false;
    for (let i = h + 1; i < candles.length; i++) {
      if (!broken && candles[i].close > level) broken = true;
      if (broken && candles[i].high >= level * 0.999 && candles[i].close < level) {
        flipped = true;
        out.push({
          id: `sr_res_${candles[h].time}`,
          kind: "sr_flip",
          bias: "bearish",
          priceTop: level,
          priceBottom: level,
          startTime: candles[h].time,
          endTime: candles[i].time,
          extendFrom: candles[i].time,
          invalidated: last.close > level * 1.01,
          score: 1,
          barIndex: h,
          htfOverlap: false,
          touched: true,
          points: [
            { time: candles[i].time, price: level },
            { time: last.time, price: level },
          ],
          meta: { role: "resistance", wick: true },
        });
        break;
      }
    }
    void flipped;
  }

  for (const l of lows.slice(-6)) {
    const level = candles[l].low;
    let broken = false;
    for (let i = l + 1; i < candles.length; i++) {
      if (!broken && candles[i].close < level) broken = true;
      if (broken && candles[i].low <= level * 1.001 && candles[i].close > level) {
        out.push({
          id: `sr_sup_${candles[l].time}`,
          kind: "sr_flip",
          bias: "bullish",
          priceTop: level,
          priceBottom: level,
          startTime: candles[l].time,
          endTime: candles[i].time,
          extendFrom: candles[i].time,
          invalidated: last.close < level * 0.99,
          score: 1,
          barIndex: l,
          htfOverlap: false,
          touched: true,
          points: [
            { time: candles[i].time, price: level },
            { time: last.time, price: level },
          ],
          meta: { role: "support", wick: true },
        });
        break;
      }
    }
  }

  return out
    .filter((z) => !z.invalidated)
    .slice(-(opts.maxZones ?? 6));
}
