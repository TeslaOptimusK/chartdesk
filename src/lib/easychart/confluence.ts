import type { Candle } from "@/lib/types";
import { detectFairValueGaps } from "@/lib/easychart/fvg";
import { detectOrderBlocks } from "@/lib/easychart/order-block";
import type {
  EasyDetectOptions,
  EasyZone,
} from "@/lib/easychart/types";

/** Spec confluence table — Phase 1 subset. */
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

/**
 * Score zones: OB +1, FVG +1, HTF∩LTF +2, sweep +2, untouched/old fade.
 * Below threshold → hide (or caller fades).
 */
export function scoreAndFilterZones(
  ltfZones: EasyZone[],
  htfZones: EasyZone[],
  threshold = CONFLUENCE_THRESHOLD
): EasyZone[] {
  const scored = ltfZones.map((z) => {
    let score = z.kind === "ob" || z.kind === "fvg" ? 1 : 0;
    let htfOverlap = false;

    for (const h of htfZones) {
      if (h.bias !== z.bias) continue;
      if (priceOverlapFrac(z, h) >= 0.25 || zonesOverlap(z, h)) {
        score += 2;
        htfOverlap = true;
        break;
      }
    }

    // Same-TF OB+FVG overlap
    for (const o of ltfZones) {
      if (o.id === z.id) continue;
      if (o.kind === z.kind) continue;
      if (o.bias !== z.bias) continue;
      if (zonesOverlap(z, o)) {
        score += 1;
        break;
      }
    }

    if (z.meta?.sweep) score += 2;
    if (!z.touched) score -= 1;
    if (z.invalidated) score -= 2;

    return { ...z, score: Math.max(0, score), htfOverlap };
  });

  return scored
    .filter((z) => !z.invalidated && z.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

export function detectEasyOverlayZones(
  ltfCandles: Candle[],
  htfCandles: Candle[] | null,
  opts: EasyDetectOptions = {}
): EasyZone[] {
  const threshold = opts.confluenceThreshold ?? CONFLUENCE_THRESHOLD;
  const ltfOb = detectOrderBlocks(ltfCandles, opts);
  const ltfFvg = detectFairValueGaps(ltfCandles, opts);
  const ltf = [...ltfOb, ...ltfFvg];

  const htf = htfCandles?.length
    ? [
        ...detectOrderBlocks(htfCandles, {
          ...opts,
          maxAgeBars: (opts.maxAgeBars ?? 80) / 2,
        }),
        ...detectFairValueGaps(htfCandles, {
          ...opts,
          maxAgeBars: (opts.maxAgeBars ?? 60) / 2,
        }),
      ]
    : [];

  return scoreAndFilterZones(ltf, htf, threshold);
}

/** Raw zones without confluence filter (for tests / debug). */
export function detectRawZones(candles: Candle[], opts?: EasyDetectOptions) {
  return {
    orderBlocks: detectOrderBlocks(candles, opts),
    fvgs: detectFairValueGaps(candles, opts),
  };
}
