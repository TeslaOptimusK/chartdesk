"use client";

import { useEffect, useRef } from "react";
import type { Time } from "lightweight-charts";
import type { ChartApiBundle } from "@/components/chart/DrawingOverlay";
import type { EasyOverlayToggles, EasyZone } from "@/lib/easychart";
import { cn } from "@/lib/utils";

interface PatternOverlayProps {
  chartApi: ChartApiBundle | null;
  zones: EasyZone[];
  toggles: EasyOverlayToggles;
  showStopLines?: boolean;
  className?: string;
}

/**
 * Separate easychart pattern overlay canvas — does not touch user drawings API.
 */
export function PatternOverlay({
  chartApi,
  zones,
  toggles,
  showStopLines = true,
  className,
}: PatternOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const anyOn =
    toggles.ob ||
    toggles.fvg ||
    toggles.trend ||
    toggles.channel ||
    toggles.fakeout ||
    toggles.srFlip ||
    toggles.fib ||
    toggles.sma365;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartApi) return;

    const paint = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? canvas.clientWidth;
      const h = parent?.clientHeight ?? canvas.clientHeight;
      if (w <= 0 || h <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const visible = zones.filter((z) => kindEnabled(z.kind, toggles));
      for (const z of visible) {
        drawShape(ctx, chartApi, z, w, toggles, showStopLines);
      }
    };

    paint();
    const ts = chartApi.chart.timeScale();
    const bump = () => paint();
    ts.subscribeVisibleLogicalRangeChange(bump);
    chartApi.chart.subscribeCrosshairMove(bump);
    const ro = new ResizeObserver(bump);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(bump);
      chartApi.chart.unsubscribeCrosshairMove(bump);
      ro.disconnect();
    };
  }, [chartApi, zones, toggles, showStopLines]);

  if (!anyOn) return null;

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        "pointer-events-none absolute inset-0 z-[11]",
        className
      )}
      data-feature="easychart.pattern_overlay"
      data-testid="pattern-overlay"
    />
  );
}

function kindEnabled(
  kind: EasyZone["kind"],
  t: EasyOverlayToggles
): boolean {
  switch (kind) {
    case "ob":
      return t.ob;
    case "fvg":
      return t.fvg;
    case "trend":
      return t.trend;
    case "channel":
      return t.channel;
    case "fakeout":
    case "trap":
      return t.fakeout;
    case "sr_flip":
      return t.srFlip;
    case "fib":
    case "fib_ext":
    case "overlap":
      return t.fib;
    case "sma365":
      return t.sma365;
    default:
      return false;
  }
}

function xy(
  api: ChartApiBundle,
  time: number,
  price: number
): { x: number; y: number } | null {
  const x = api.chart.timeScale().timeToCoordinate(time as Time);
  const y = api.series.priceToCoordinate(price);
  if (x == null || y == null) return null;
  return { x, y };
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  canvasW: number,
  toggles: EasyOverlayToggles,
  showStop: boolean
) {
  const emphasize = toggles.confluence;
  const strong = z.htfOverlap || z.score >= 3 || z.kind === "overlap";
  const fade = emphasize && !strong && z.score < 2 && (z.kind === "ob" || z.kind === "fvg");

  if (z.kind === "ob" || z.kind === "fvg" || z.kind === "overlap") {
    drawBox(ctx, api, z, canvasW, strong, fade, toggles.halfTpLabel, showStop);
    return;
  }
  if (z.kind === "trend") {
    drawTrend(ctx, api, z, canvasW, strong);
    return;
  }
  if (z.kind === "channel") {
    drawChannel(ctx, api, z, canvasW, strong);
    return;
  }
  if (z.kind === "sr_flip") {
    drawRay(ctx, api, z, canvasW, strong);
    return;
  }
  if (z.kind === "fib" || z.kind === "fib_ext") {
    drawFib(ctx, api, z, canvasW, strong);
    return;
  }
  if (z.kind === "fakeout" || z.kind === "trap") {
    drawMarker(ctx, api, z, strong);
    return;
  }
  if (z.kind === "sma365") {
    drawSma(ctx, api, z, canvasW);
  }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  canvasW: number,
  strong: boolean,
  fade: boolean,
  halfTp: boolean,
  showStop: boolean
) {
  const x0 =
    api.chart.timeScale().timeToCoordinate(z.extendFrom as Time) ??
    api.chart.timeScale().timeToCoordinate(z.startTime as Time);
  const yTop = api.series.priceToCoordinate(z.priceTop);
  const yBot = api.series.priceToCoordinate(z.priceBottom);
  if (x0 == null || yTop == null || yBot == null) return;
  const x1 = canvasW - 8;
  if (x1 <= x0) return;

  const alpha = fade ? 0.08 : strong ? 0.32 : 0.16;
  const strokeA = fade ? 0.25 : strong ? 0.95 : 0.55;
  const bull = z.bias === "bullish";
  let fill = `rgba(148,163,184,${alpha})`;
  let stroke = `rgba(148,163,184,${strokeA})`;
  if (z.kind === "ob") {
    fill = bull ? `rgba(56,189,248,${alpha})` : `rgba(251,113,133,${alpha})`;
    stroke = bull ? `rgba(56,189,248,${strokeA})` : `rgba(251,113,133,${strokeA})`;
  } else if (z.kind === "fvg") {
    fill = bull ? `rgba(52,211,153,${alpha})` : `rgba(192,132,252,${alpha})`;
    stroke = bull ? `rgba(52,211,153,${strokeA})` : `rgba(192,132,252,${strokeA})`;
  } else if (z.kind === "overlap") {
    fill = `rgba(250,204,21,${Math.max(alpha, 0.22)})`;
    stroke = `rgba(250,204,21,${strokeA})`;
  }

  const top = Math.min(yTop, yBot);
  const height = Math.max(Math.abs(yBot - yTop), 1);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strong ? 2 : 1;
  ctx.beginPath();
  ctx.rect(x0, top, x1 - x0, height);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = stroke;
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText(
    `${z.kind.toUpperCase()} ${bull ? "↑" : z.bias === "bearish" ? "↓" : "·"} ${z.score}${z.htfOverlap ? " HTF" : ""}`,
    x0 + 3,
    top + 10
  );
  if (halfTp && z.touched) {
    ctx.fillStyle = "rgba(250,204,21,0.9)";
    ctx.fillText("½TP · 반익반본", x0 + 3, top + 22);
  }
  if (showStop && z.stopPrice != null) {
    const ys = api.series.priceToCoordinate(z.stopPrice);
    if (ys != null) {
      ctx.strokeStyle = `rgba(248,250,252,0.45)`;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, ys);
      ctx.lineTo(x1, ys);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawTrend(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  canvasW: number,
  strong: boolean
) {
  if (!z.points || z.points.length < 2) return;
  const [a, b] = z.points;
  const p0 = xy(api, a.time, a.price);
  const p1 = xy(api, b.time, b.price);
  if (!p0 || !p1) return;
  const dt = b.time - a.time;
  const slope = dt !== 0 ? (b.price - a.price) / dt : 0;
  const xEnd = canvasW - 8;
  // Extend by projecting price at a far time using x ratio approx via last known
  const lastT = b.time + (b.time - a.time);
  const extPrice = b.price + slope * (lastT - b.time);
  const pExt = xy(api, lastT, extPrice) ?? { x: xEnd, y: p1.y };
  const color =
    z.bias === "bullish" ? "rgba(56,189,248,0.9)" : "rgba(251,113,133,0.9)";
  ctx.strokeStyle = color;
  ctx.lineWidth = strong ? 2 : 1.25;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(Math.max(pExt.x, xEnd), pExt.y);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText("TL wick", p0.x + 2, p0.y - 4);
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  canvasW: number,
  strong: boolean
) {
  if (!z.points || z.points.length < 2 || !z.parallelPoints) return;
  const [a, b] = z.points;
  const [c, d] = z.parallelPoints;
  const p0 = xy(api, a.time, a.price);
  const p1 = xy(api, b.time, b.price);
  const q0 = xy(api, c.time, c.price);
  const q1 = xy(api, d.time, d.price);
  if (!p0 || !p1 || !q0 || !q1) return;
  const xEnd = canvasW - 8;
  const dt = b.time - a.time;
  const slope = dt !== 0 ? (b.price - a.price) / dt : 0;
  const tFar = b.time + (b.time - a.time);
  const pExt = xy(api, tFar, b.price + slope * (tFar - b.time));
  const qExt = xy(api, tFar, d.price + slope * (tFar - d.time));
  const color = "rgba(167,139,250,0.85)";
  ctx.strokeStyle = color;
  ctx.lineWidth = strong ? 2 : 1.25;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  if (pExt) ctx.lineTo(Math.max(pExt.x, xEnd), pExt.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(q0.x, q0.y);
  ctx.lineTo(q1.x, q1.y);
  if (qExt) ctx.lineTo(Math.max(qExt.x, xEnd), qExt.y);
  ctx.stroke();
  // Mid dashed
  const mid0 = xy(api, a.time, (a.price + c.price) / 2);
  const mid1 = xy(api, b.time, (b.price + d.price) / 2);
  const midExt = xy(
    api,
    tFar,
    (b.price + d.price) / 2 + slope * (tFar - b.time)
  );
  if (mid0 && mid1) {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "rgba(226,232,240,0.55)";
    ctx.beginPath();
    ctx.moveTo(mid0.x, mid0.y);
    ctx.lineTo(mid1.x, mid1.y);
    if (midExt) ctx.lineTo(Math.max(midExt.x, xEnd), midExt.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = color;
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText("CH mid", p0.x + 2, p0.y - 4);
}

function drawRay(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  canvasW: number,
  strong: boolean
) {
  const y = api.series.priceToCoordinate(z.priceTop);
  const x0 =
    api.chart.timeScale().timeToCoordinate(z.extendFrom as Time) ??
    api.chart.timeScale().timeToCoordinate(z.startTime as Time);
  if (y == null || x0 == null) return;
  const color =
    z.bias === "bullish" ? "rgba(52,211,153,0.85)" : "rgba(251,113,133,0.85)";
  ctx.strokeStyle = color;
  ctx.lineWidth = strong ? 1.75 : 1;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(canvasW - 8, y);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText(
    `S/R ${z.meta?.role === "support" ? "지지" : "저항"}`,
    x0 + 2,
    y - 4
  );
}

function drawFib(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  canvasW: number,
  strong: boolean
) {
  if (!z.fibLevels?.length) return;
  const x0 =
    api.chart.timeScale().timeToCoordinate(z.extendFrom as Time) ??
    api.chart.timeScale().timeToCoordinate(z.startTime as Time);
  if (x0 == null) return;
  for (const lv of z.fibLevels) {
    const y = api.series.priceToCoordinate(lv.price);
    if (y == null) continue;
    const emphasis =
      lv.ratio === 0.618 || lv.ratio === 1 || lv.ratio === 1.618;
    ctx.strokeStyle = emphasis
      ? "rgba(250,204,21,0.85)"
      : "rgba(148,163,184,0.45)";
    ctx.lineWidth = emphasis || strong ? 1.5 : 1;
    ctx.setLineDash(emphasis ? [] : [3, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(canvasW - 8, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText(
      `${z.kind === "fib_ext" ? "Ext" : "Fib"} ${lv.ratio}`,
      x0 + 2,
      y - 3
    );
  }
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  strong: boolean
) {
  if (z.markerTime == null || z.markerPrice == null) return;
  const p = xy(api, z.markerTime, z.markerPrice);
  if (!p) return;
  const trap = z.kind === "trap";
  ctx.fillStyle = trap ? "rgba(251,146,60,0.95)" : "rgba(244,114,182,0.95)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, strong ? 5 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "8px ui-monospace, monospace";
  ctx.fillText(trap ? "TRAP" : "FAKE", p.x + 6, p.y + 3);
}

function drawSma(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  canvasW: number
) {
  const pts = z.points ?? [];
  if (pts.length < 2) {
    const y = api.series.priceToCoordinate(z.priceTop);
    if (y == null) return;
    ctx.strokeStyle = "rgba(251,191,36,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  } else {
    ctx.strokeStyle =
      z.bias === "bullish"
        ? "rgba(52,211,153,0.8)"
        : "rgba(251,191,36,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const pt of pts) {
      const p = xy(api, pt.time, pt.price);
      if (!p) continue;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  const label = String(z.meta?.label ?? "365 SMA");
  const y = api.series.priceToCoordinate(z.priceTop);
  if (y != null) {
    ctx.fillStyle = "rgba(251,191,36,0.95)";
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText(label, 8, y - 4);
  }
}
