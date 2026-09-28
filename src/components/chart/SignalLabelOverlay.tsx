"use client";

import { useEffect, useState } from "react";
import type { Time } from "lightweight-charts";
import type { ChartApiBundle } from "@/components/chart/DrawingOverlay";
import { CHART_LABEL_FAMILY } from "@/components/chart/chart-label";
import type { EntrySignal, EntrySignalKind } from "@/lib/entry-signals";
import type { Candle } from "@/lib/types";

const LABEL_COLOR: Record<EntrySignalKind, string> = {
  confluence_entry: "#6ee7b7",
  channel_break_up: "#6ee7b7",
  setup: "#fde68a",
  macd_hist_flip_up: "#a5f3fc",
  stoch_rsi_cross_up: "#ddd6fe",
};

/**
 * HTML labels sit on the browser's text renderer, so Hangul stays sharp on
 * high-DPI screens. Series-marker text is a scaled canvas bitmap.
 */
export function SignalLabelOverlay({
  chartApi,
  signals,
  candles,
  enabled,
}: {
  chartApi: ChartApiBundle | null;
  signals: EntrySignal[];
  candles: Candle[];
  enabled: boolean;
}) {
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!chartApi) return;
    const bump = () => setRev((n) => n + 1);
    const scale = chartApi.chart.timeScale();
    scale.subscribeVisibleLogicalRangeChange(bump);
    chartApi.chart.subscribeCrosshairMove(bump);
    return () => {
      scale.unsubscribeVisibleLogicalRangeChange(bump);
      chartApi.chart.unsubscribeCrosshairMove(bump);
    };
  }, [chartApi]);

  if (!enabled || !chartApi || signals.length === 0) return null;
  void rev;

  const byTime = new Map(candles.map((c) => [c.time, c]));
  const aboveSlot = new Map<number, number>();
  const belowSlot = new Map<number, number>();
  const draft: {
    key: string;
    x: number;
    y: number;
    above: boolean;
    label: string;
    color: string;
    w: number;
  }[] = [];

  for (const signal of signals) {
    const x = chartApi.chart.timeScale().timeToCoordinate(signal.time as Time);
    if (x == null || x < -40) continue;
    const above = signal.kind === "setup";
    const bar = byTime.get(signal.time);
    const anchor = bar ? (above ? bar.high : bar.low) : signal.price;
    const y0 = chartApi.series.priceToCoordinate(anchor);
    if (y0 == null) continue;
    const slots = above ? aboveSlot : belowSlot;
    const slot = slots.get(signal.time) ?? 0;
    slots.set(signal.time, slot + 1);
    const y = above ? y0 - 18 - slot * 18 : y0 + 18 + slot * 18;
    draft.push({
      key: `${signal.time}-${signal.kind}`,
      x,
      y,
      above,
      label: signal.label,
      color: LABEL_COLOR[signal.kind],
      w: Math.max(36, signal.label.length * 8.4),
    });
  }

  draft.sort((a, b) => a.x - b.x);
  const placed: { x: number; y: number; w: number }[] = [];
  for (const item of draft) {
    let guard = 0;
    while (
      guard < 8 &&
      placed.some(
        (p) => Math.abs(p.x - item.x) < (p.w + item.w) / 2 && Math.abs(p.y - item.y) < 16
      )
    ) {
      item.y += item.above ? -16 : 16;
      guard += 1;
    }
    placed.push(item);
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      data-feature="signal.entry.labels"
    >
      {draft.map((item) => (
        <div
          key={item.key}
          style={{
            position: "absolute",
            left: Math.round(item.x),
            top: Math.round(item.y),
            transform: "translate(-50%, -50%)",
            fontFamily: CHART_LABEL_FAMILY,
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            color: item.color,
            background: "rgba(7, 11, 16, 0.78)",
            borderRadius: 3,
            padding: "1px 5px",
            whiteSpace: "nowrap",
            textShadow: "0 1px 1px rgba(0,0,0,0.65)",
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
