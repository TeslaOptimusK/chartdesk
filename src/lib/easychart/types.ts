import type { Candle, Timeframe } from "@/lib/types";

export type EasyOverlayKind =
  | "ob"
  | "fvg"
  | "trend"
  | "channel"
  | "fakeout"
  | "trap"
  | "sr_flip"
  | "fib"
  | "fib_ext"
  | "overlap"
  | "sma365";

export type EasyOverlayBias = "bullish" | "bearish" | "neutral";

export type EasyOverlayPreset = "scalp" | "swing";

export interface EasyOverlayToggles {
  ob: boolean;
  fvg: boolean;
  confluence: boolean;
  trend: boolean;
  channel: boolean;
  fakeout: boolean;
  srFlip: boolean;
  fib: boolean;
  overlapOnly: boolean;
  halfTpLabel: boolean;
  /** Daily 365 SMA regime (Phase 2) */
  sma365: boolean;
}

export const DEFAULT_EASY_TOGGLES: EasyOverlayToggles = {
  ob: true,
  fvg: true,
  confluence: true,
  trend: true,
  channel: true,
  fakeout: true,
  srFlip: true,
  fib: true,
  overlapOnly: false,
  halfTpLabel: false,
  sma365: true,
};

export interface EasyPoint {
  time: number;
  price: number;
}

export interface EasyZone {
  id: string;
  kind: EasyOverlayKind;
  bias: EasyOverlayBias;
  /** Box / band top-bottom (OB, FVG, overlap, channel bounds) */
  priceTop: number;
  priceBottom: number;
  startTime: number;
  endTime: number;
  extendFrom: number;
  invalidated: boolean;
  score: number;
  stopPrice?: number;
  barIndex: number;
  htfOverlap: boolean;
  touched: boolean;
  /** Line / ray / channel geometry (wick-based) */
  points?: EasyPoint[];
  /** Parallel channel opposite line points */
  parallelPoints?: EasyPoint[];
  /** Fib ratios → prices */
  fibLevels?: { ratio: number; price: number }[];
  /** Marker (fakeout/trap) */
  markerTime?: number;
  markerPrice?: number;
  meta?: Record<string, number | string | boolean>;
}

export interface EasyDetectOptions {
  minBodyRatio?: number;
  fvgMiddleMinRatio?: number;
  fvgMiddleMaxRatio?: number;
  confluenceThreshold?: number;
  maxZones?: number;
  maxAgeBars?: number;
  /** Include Phase 2 shapes */
  enableTrend?: boolean;
  enableChannel?: boolean;
  enableFakeout?: boolean;
  enableSrFlip?: boolean;
  enableFib?: boolean;
  enableSma365?: boolean;
}

export const SCALP_STRUCTURE_TF: Timeframe = "60";
export const SCALP_ENTRY_TF: Timeframe = "15";
export const SWING_STRUCTURE_TF: Timeframe = "D";
export const SWING_ENTRY_TF: Timeframe = "240";

export const FIB_TB_RATIOS = [0.618, 1.0, 1.618] as const;

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

export function isDoji(c: Candle, maxBodyFrac = 0.12): boolean {
  return bodySize(c) / rangeSize(c) <= maxBodyFrac;
}

export function isBullish(c: Candle): boolean {
  return c.close > c.open;
}

export function isBearish(c: Candle): boolean {
  return c.close < c.open;
}

export function wickUpper(c: Candle): number {
  return c.high - bodyHigh(c);
}

export function wickLower(c: Candle): number {
  return bodyLow(c) - c.low;
}
