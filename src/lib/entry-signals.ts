import type { Candle } from "@/lib/types";
import { macd } from "@/lib/indicators";
import { stochasticRsi } from "@/lib/indicators-extra";
import { detectChannels } from "@/lib/easychart/channel";
import { trendPriceAt } from "@/lib/easychart/trend";
import type { EasyZone } from "@/lib/easychart/types";

/**
 * Transparent indicator entry signals (LazyAlpha principle, not a Pine clone).
 * Feature ID: signal.entry.auto
 */

export type EntrySignalKind =
  | "stoch_rsi_cross_up"
  | "macd_hist_flip_up"
  | "setup"
  | "confluence_entry"
  | "channel_break_up";

export interface EntrySignal {
  time: number;
  barIndex: number;
  kind: EntrySignalKind;
  /** Short Korean chart label */
  label: string;
  price: number;
  /** Honest rule text for legend / alerts */
  rule: string;
}

export interface DetectEntrySignalsOptions {
  /** Bars within which Stoch RSI + MACD must both fire for confluence */
  alignWindow?: number;
  /** Max markers returned (most recent last) */
  maxSignals?: number;
  /** Include easychart channel upper breakout */
  includeChannelBreak?: boolean;
}

const KIND_LABEL: Record<EntrySignalKind, string> = {
  stoch_rsi_cross_up: "Stoch RSI 상향돌파",
  macd_hist_flip_up: "MACD 양전환",
  setup: "셋업 형성",
  confluence_entry: "복합 진입",
  channel_break_up: "돌파 진입",
};

const KIND_RULE: Record<EntrySignalKind, string> = {
  stoch_rsi_cross_up: "Stoch RSI K가 D를 아래에서 위로 교차",
  macd_hist_flip_up: "MACD 히스토그램이 음→양 전환",
  setup: "Stoch RSI 상향돌파 또는 MACD 양전환 중 하나만 최근 창에서 발생",
  confluence_entry: "Stoch RSI 상향돌파 + MACD 히스토그램 양전환 정렬",
  channel_break_up: "상승 채널 상단선 종가 상향 돌파",
};

/** Technical-alert targetId ↔ signal kind */
export const ENTRY_ALERT_TARGETS: Record<string, EntrySignalKind> = {
  "entry.stoch_rsi": "stoch_rsi_cross_up",
  "entry.macd": "macd_hist_flip_up",
  "entry.setup": "setup",
  "entry.confluence": "confluence_entry",
  "entry.channel_break": "channel_break_up",
};

function channelUpperPrice(zone: EasyZone, time: number): number | null {
  const pts = zone.parallelPoints ?? zone.points;
  if (!pts || pts.length < 2) return null;
  const fakeTrend = {
    id: zone.id,
    kind: "trend" as const,
    bias: zone.bias,
    priceTop: zone.priceTop,
    priceBottom: zone.priceBottom,
    startTime: zone.startTime,
    endTime: zone.endTime,
    extendFrom: zone.extendFrom,
    invalidated: false,
    score: zone.score,
    barIndex: zone.barIndex,
    htfOverlap: false,
    touched: false,
    points: pts,
  };
  return trendPriceAt(fakeTrend, time);
}

function channelLowerPrice(zone: EasyZone, time: number): number | null {
  if (!zone.points || zone.points.length < 2) return null;
  const fakeTrend = {
    id: zone.id,
    kind: "trend" as const,
    bias: zone.bias,
    priceTop: zone.priceTop,
    priceBottom: zone.priceBottom,
    startTime: zone.startTime,
    endTime: zone.endTime,
    extendFrom: zone.extendFrom,
    invalidated: false,
    score: zone.score,
    barIndex: zone.barIndex,
    htfOverlap: false,
    touched: false,
    points: zone.points,
  };
  return trendPriceAt(fakeTrend, time);
}

/**
 * Detect automatic entry / setup markers from candles only (no user drawings).
 */
export function detectEntrySignals(
  candles: Candle[],
  opts: DetectEntrySignalsOptions = {}
): EntrySignal[] {
  const alignWindow = opts.alignWindow ?? 5;
  const maxSignals = opts.maxSignals ?? 40;
  const includeChannel = opts.includeChannelBreak !== false;

  if (candles.length < 40) return [];

  const { k, d } = stochasticRsi(candles);
  const { hist } = macd(candles);

  const stochCrossBars: number[] = [];
  const macdFlipBars: number[] = [];
  const out: EntrySignal[] = [];

  for (let i = 1; i < candles.length; i++) {
    const k0 = k[i - 1];
    const d0 = d[i - 1];
    const k1 = k[i];
    const d1 = d[i];
    if (k0 != null && d0 != null && k1 != null && d1 != null) {
      if (k0 <= d0 && k1 > d1) {
        stochCrossBars.push(i);
        out.push({
          time: candles[i].time,
          barIndex: i,
          kind: "stoch_rsi_cross_up",
          label: KIND_LABEL.stoch_rsi_cross_up,
          price: candles[i].low,
          rule: KIND_RULE.stoch_rsi_cross_up,
        });
      }
    }

    const h0 = hist[i - 1];
    const h1 = hist[i];
    if (h0 != null && h1 != null && h0 <= 0 && h1 > 0) {
      macdFlipBars.push(i);
      out.push({
        time: candles[i].time,
        barIndex: i,
        kind: "macd_hist_flip_up",
        label: KIND_LABEL.macd_hist_flip_up,
        price: candles[i].low,
        rule: KIND_RULE.macd_hist_flip_up,
      });
    }
  }

  // Confluence: Stoch RSI + MACD aligned within window → single “복합 진입”
  const eventBars = new Set([...stochCrossBars, ...macdFlipBars]);
  for (const i of [...eventBars].sort((a, b) => a - b)) {
    const stochNear = stochCrossBars.some(
      (b) => Math.abs(b - i) <= alignWindow
    );
    const macdNear = macdFlipBars.some((b) => Math.abs(b - i) <= alignWindow);
    if (!(stochNear && macdNear)) continue;
    const stochAt = stochCrossBars
      .filter((b) => Math.abs(b - i) <= alignWindow)
      .sort((a, b) => a - b)
      .pop()!;
    const macdAt = macdFlipBars
      .filter((b) => Math.abs(b - i) <= alignWindow)
      .sort((a, b) => a - b)
      .pop()!;
    const at = Math.max(stochAt, macdAt);
    if (at !== i) continue;
    out.push({
      time: candles[at].time,
      barIndex: at,
      kind: "confluence_entry",
      label: KIND_LABEL.confluence_entry,
      price: candles[at].low,
      rule: KIND_RULE.confluence_entry,
    });
  }

  // Setup: lone Stoch RSI cross while price sits in upper half of a bullish channel
  if (includeChannel) {
    const channels = detectChannels(candles, { maxZones: 3 });
    for (const i of stochCrossBars) {
      const macdNear = macdFlipBars.some(
        (b) => Math.abs(b - i) <= alignWindow
      );
      if (macdNear) continue;
      for (const ch of channels) {
        if (ch.bias !== "bullish") continue;
        const upper = channelUpperPrice(ch, candles[i].time);
        const lower = channelLowerPrice(ch, candles[i].time);
        if (upper == null || lower == null) continue;
        const mid = (upper + lower) / 2;
        const close = candles[i].close;
        if (close >= mid && close <= upper * 1.002) {
          out.push({
            time: candles[i].time,
            barIndex: i,
            kind: "setup",
            label: KIND_LABEL.setup,
            price: candles[i].high,
            rule: "채널 상단 부근 + Stoch RSI 상향돌파 (MACD 미확정)",
          });
          break;
        }
      }
    }
  }

  if (includeChannel) {
    const channels = detectChannels(candles, { maxZones: 3 });
    for (const ch of channels) {
      if (ch.bias !== "bullish") continue;
      for (let i = 1; i < candles.length; i++) {
        const t = candles[i].time;
        if (t < ch.startTime) continue;
        const upper = channelUpperPrice(ch, t);
        const prevUpper = channelUpperPrice(ch, candles[i - 1].time);
        if (upper == null || prevUpper == null) continue;
        const prev = candles[i - 1].close;
        const cur = candles[i].close;
        if (prev <= prevUpper && cur > upper) {
          const lower = channelLowerPrice(ch, t);
          if (lower != null && cur < (upper + lower) / 2) continue;
          out.push({
            time: t,
            barIndex: i,
            kind: "channel_break_up",
            label: KIND_LABEL.channel_break_up,
            price: cur,
            rule: KIND_RULE.channel_break_up,
          });
        }
      }
    }
  }

  // Dedupe same kind+time, keep order, trim
  const seen = new Set<string>();
  const deduped: EntrySignal[] = [];
  for (const s of out.sort((a, b) => a.barIndex - b.barIndex || a.kind.localeCompare(b.kind))) {
    const key = `${s.kind}:${s.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }
  return deduped.slice(-maxSignals);
}

/** True if the latest closed bar (or last N bars) carries this kind. */
export function lastBarHasEntrySignal(
  candles: Candle[],
  kind: EntrySignalKind,
  lookback = 1
): EntrySignal | null {
  const signals = detectEntrySignals(candles);
  if (!signals.length || !candles.length) return null;
  const lastIdx = candles.length - 1;
  const minIdx = Math.max(0, lastIdx - lookback + 1);
  for (let i = signals.length - 1; i >= 0; i--) {
    const s = signals[i];
    if (s.kind !== kind) continue;
    if (s.barIndex >= minIdx && s.barIndex <= lastIdx) return s;
  }
  return null;
}

export function entrySignalForAlertTarget(
  candles: Candle[],
  targetId: string
): EntrySignal | null {
  const kind = ENTRY_ALERT_TARGETS[targetId];
  if (!kind) return null;
  // Confluence / channel: fire on current bar only; component signals allow 1-bar lookback
  const lookback = kind === "confluence_entry" || kind === "channel_break_up" ? 1 : 1;
  return lastBarHasEntrySignal(candles, kind, lookback);
}
