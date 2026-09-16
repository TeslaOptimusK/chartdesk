import type { Candle, Timeframe } from "@/lib/types";

export type EasyOverlayKind = "ob" | "fvg";

export type EasyOverlayBias = "bullish" | "bearish";

export type EasyOverlayPreset = "scalp" | "swing";

/** Phase 1 toggles + Phase 2 stubs */
export interface EasyOverlayToggles {
  ob: boolean;
  fvg: boolean;
  confluence: boolean;
  /** Phase 2 stubs — UI only unless cheap */
  trend: boolean;
  channel: boolean;
  fakeout: boolean;
  srFlip: boolean;
  fib: boolean;
  overlapOnly: boolean;
  halfTpLabel: boolean;
}

export const DEFAULT_EASY_TOGGLES: EasyOverlayToggles = {
  ob: true,
  fvg: true,
  confluence: true,
  trend: false,
  channel: false,
  fakeout: false,
  srFlip: false,
  fib: false,
  overlapOnly: false,
  halfTpLabel: false,
};

export interface EasyZone {
  id: string;
  kind: EasyOverlayKind;
  bias: EasyOverlayBias;
  /** Body-only for OB; gap high/low for FVG */
  priceTop: number;
  priceBottom: number;
  startTime: number;
  endTime: number;
  /** Extend right from this time */
  extendFrom: number;
  invalidated: boolean;
  score: number;
  /** Optional wick stop line price */
  stopPrice?: number;
  /** Candle indices involved (LTF series) */
  barIndex: number;
  /** HTF∩LTF overlap */
  htfOverlap: boolean;
  touched: boolean;
  meta?: Record<string, number | string | boolean>;
}

export interface EasyDetectOptions {
  minBodyRatio?: number;
  fvgMiddleMinRatio?: number;
  fvgMiddleMaxRatio?: number;
  confluenceThreshold?: number;
  maxZones?: number;
  maxAgeBars?: number;
}

export const SCALP_STRUCTURE_TF: Timeframe = "60";
export const SCALP_ENTRY_TF: Timeframe = "15";
export const SWING_STRUCTURE_TF: Timeframe = "D";
export const SWING_ENTRY_TF: Timeframe = "240";

export function bodyHigh(c: Candle): number {
  return Math.max(c.open, c.close);
}

export function bodyLow(c: Candle): number {
  return Math.min(c.open, c.close);
}

export function bodySize(c: Candle): number {
  return Math.abs(c.close - c.open);
}

export function rangeSize(c: Candle): number {
  return Math.max(c.high - c.low, 1e-12);
}

/** Doji: body is tiny vs full range */
export function isDoji(c: Candle, maxBodyFrac = 0.12): boolean {
  return bodySize(c) / rangeSize(c) <= maxBodyFrac;
}

export function isBullish(c: Candle): boolean {
  return c.close > c.open;
}

export function isBearish(c: Candle): boolean {
  return c.close < c.open;
}
