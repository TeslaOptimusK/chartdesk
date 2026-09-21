import type { Candle } from "@/lib/types";
import { detectChannels } from "@/lib/easychart/channel";
import { detectFakeoutTraps } from "@/lib/easychart/fakeout";
import { detectFibStructures } from "@/lib/easychart/fib";
import { detectFairValueGaps } from "@/lib/easychart/fvg";
import { detectOrderBlocks } from "@/lib/easychart/order-block";
import { detectSma365Regime } from "@/lib/easychart/regime";
import { detectSrFlips } from "@/lib/easychart/sr-flip";
import { detectTrendLines } from "@/lib/easychart/trend";
import type {
  EasyDetectOptions,
  EasyOverlayToggles,
  EasyZone,
} from "@/lib/easychart/types";
import { DEFAULT_EASY_TOGGLES } from "@/lib/easychart/types";

export const CONFLUENCE_THRESHOLD = 2;

export function zonesOverlap(
  a: EasyZone,
  b: EasyZone,
  padFrac = 0.05
): boolean {
  const aMid = (a.priceTop + a.priceBottom) / 2;
  const bMid = (b.priceTop + b.priceBottom) / 2;
  const aH = Math.max(a.priceTop - a.priceBottom, 1e-12);
  const bH = Math.max(b.priceTop - b.priceBottom, 1e-12);
  const pad = Math.max(aH, bH) * padFrac;
  return !(
    a.priceBottom > b.priceTop + pad ||
    b.priceBottom > a.priceTop + pad ||
    Math.abs(aMid - bMid) > Math.max(aH, bH) * 2
  );
}

function priceOverlapFrac(a: EasyZone, b: EasyZone): number {
  const top = Math.min(a.priceTop, b.priceTop);
  const bottom = Math.max(a.priceBottom, b.priceBottom);
  if (top <= bottom) return 0;
  const overlap = top - bottom;
  const denom = Math.min(
    a.priceTop - a.priceBottom,
    b.priceTop - b.priceBottom
  );
  return denom > 0 ? overlap / denom : 0;
}

function baseScore(kind: EasyZone["kind"]): number {
  switch (kind) {
    case "ob":
    case "fvg":
    case "trend":
    case "channel":
    case "sr_flip":
    case "fib":
    case "fib_ext":
    case "sma365":
      return 1;
    case "fakeout":
    case "trap":
    case "overlap":
      return 2;
    default:
      return 0;
  }
}

export function scoreAndFilterZones(
  ltfZones: EasyZone[],
  htfZones: EasyZone[],
  threshold = CONFLUENCE_THRESHOLD
): EasyZone[] {
  const scored = ltfZones.map((z) => {
    let score = baseScore(z.kind);
    let htfOverlap = false;

    for (const h of htfZones) {
      if (h.bias !== "neutral" && z.bias !== "neutral" && h.bias !== z.bias)
        continue;
      if (priceOverlapFrac(z, h) >= 0.2 || zonesOverlap(z, h)) {
        score += 2;
        htfOverlap = true;
        break;
      }
    }

    for (const o of ltfZones) {
      if (o.id === z.id) continue;
      if (o.kind === z.kind) continue;
      if (
        o.bias !== "neutral" &&
        z.bias !== "neutral" &&
        o.bias !== z.bias
      )
        continue;
      if (zonesOverlap(z, o, 0.08)) {
        if (
          (z.kind === "ob" || z.kind === "fvg") &&
          (o.kind === "ob" || o.kind === "fvg")
        ) {
          score += 1;
        } else if (z.kind === "fib" || o.kind === "sr_flip") {
          score += 2;
        } else {
          score += 1;
        }
        break;
      }
    }

    if (z.kind === "fakeout" || z.kind === "trap") score += 0; // already 2
    if (z.meta?.sweep) score += 2;
    if (!z.touched && (z.kind === "ob" || z.kind === "fvg")) score -= 1;
    if (z.invalidated) score -= 2;

    return { ...z, score: Math.max(0, score), htfOverlap };
  });

  return scored
    .filter((z) => {
      if (z.invalidated) return false;
      // Always keep structural lines / regime / markers with score>=1
      if (
        z.kind === "trend" ||
        z.kind === "channel" ||
        z.kind === "sr_flip" ||
        z.kind === "sma365" ||
        z.kind === "fib" ||
        z.kind === "fib_ext" ||
        z.kind === "fakeout" ||
        z.kind === "trap" ||
        z.kind === "overlap"
      ) {
        return z.score >= 1;
      }
      return z.score >= threshold;
    })
    .sort((a, b) => b.score - a.score);
}

export function detectEasyOverlayZones(
  ltfCandles: Candle[],
  htfCandles: Candle[] | null,
  opts: EasyDetectOptions = {},
  toggles: EasyOverlayToggles = DEFAULT_EASY_TOGGLES
): EasyZone[] {
  const threshold = opts.confluenceThreshold ?? CONFLUENCE_THRESHOLD;
  const ltf: EasyZone[] = [];

  if (toggles.ob) ltf.push(...detectOrderBlocks(ltfCandles, opts));
  if (toggles.fvg) ltf.push(...detectFairValueGaps(ltfCandles, opts));
  if (toggles.trend ?? opts.enableTrend)
    ltf.push(...detectTrendLines(ltfCandles, opts));
  if (toggles.channel ?? opts.enableChannel)
    ltf.push(...detectChannels(ltfCandles, opts));
  if (toggles.fakeout ?? opts.enableFakeout)
    ltf.push(...detectFakeoutTraps(ltfCandles, opts));
  if (toggles.srFlip ?? opts.enableSrFlip)
    ltf.push(...detectSrFlips(ltfCandles, opts));

  const srPrices = ltf
    .filter((z) => z.kind === "sr_flip")
    .map((z) => z.priceTop);

  if (toggles.fib ?? opts.enableFib)
    ltf.push(...detectFibStructures(ltfCandles, srPrices, opts));
  if (toggles.sma365 ?? opts.enableSma365)
    ltf.push(...detectSma365Regime(ltfCandles, opts));

  const htf =
    htfCandles?.length
      ? [
          ...(toggles.ob
            ? detectOrderBlocks(htfCandles, {
                ...opts,
                maxAgeBars: (opts.maxAgeBars ?? 80) / 2,
              })
            : []),
          ...(toggles.fvg
            ? detectFairValueGaps(htfCandles, {
                ...opts,
                maxAgeBars: (opts.maxAgeBars ?? 60) / 2,
              })
            : []),
          ...(toggles.srFlip ? detectSrFlips(htfCandles, opts) : []),
        ]
      : [];

  let scored = scoreAndFilterZones(ltf, htf, threshold);
  if (toggles.overlapOnly) {
    scored = scored.filter(
      (z) =>
        z.htfOverlap ||
        z.kind === "overlap" ||
        z.score >= 3 ||
        z.kind === "sma365"
    );
  }
  return scored;
}

/**
 * Hide zones whose prices sit far outside the displayed candle range.
 * Callers should already detect on those candles; this stops a stale
 * series from painting fib/channel/OB into empty scale space.
 */
export function zonesInsideCandleRange(
  zones: EasyZone[],
  candles: Candle[],
  factor = 1.5
): EasyZone[] {
  if (!zones.length || !candles.length) return zones.length && !candles.length ? [] : zones;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of candles) {
    if (c.high > hi) hi = c.high;
    if (c.low < lo) lo = c.low;
  }
  const mid = (hi + lo) / 2;
  const span = Math.max(hi - lo, Math.abs(mid) * 0.004, 1e-9);
  const pad = span * factor;
  const minP = lo - pad;
  const maxP = hi + pad;
  return zones.filter((z) => {
    const zMid = (z.priceTop + z.priceBottom) / 2;
    if (zMid > hi + pad || zMid < lo - pad) return false;
    if (z.priceBottom > maxP || z.priceTop < minP) return false;
    const levels = z.fibLevels ?? [];
    if (levels.some((lv) => lv.price > maxP || lv.price < minP)) return false;
    const pts = [...(z.points ?? []), ...(z.parallelPoints ?? [])];
    if (pts.some((p) => p.price > maxP || p.price < minP)) return false;
    return true;
  });
}

export function detectRawZones(candles: Candle[], opts?: EasyDetectOptions) {
  return {
    orderBlocks: detectOrderBlocks(candles, opts),
    fvgs: detectFairValueGaps(candles, opts),
    trends: detectTrendLines(candles, opts),
    channels: detectChannels(candles, opts),
    fakeouts: detectFakeoutTraps(candles, opts),
    srFlips: detectSrFlips(candles, opts),
    fibs: detectFibStructures(candles, [], opts),
    sma365: detectSma365Regime(candles, opts),
  };
}
