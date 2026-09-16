"use client";

import { useEffect, useRef } from "react";
import type { Time } from "lightweight-charts";
import type { ChartApiBundle } from "@/components/chart/DrawingOverlay";
import type { EasyZone } from "@/lib/easychart";
import { cn } from "@/lib/utils";

interface PatternOverlayProps {
  chartApi: ChartApiBundle | null;
  zones: EasyZone[];
  showOb: boolean;
  showFvg: boolean;
  showConfluence: boolean;
  showStopLines?: boolean;
  halfTpLabel?: boolean;
  className?: string;
}

/**
 * Separate easychart pattern overlay canvas — does not touch user drawings API.
 */
export function PatternOverlay({
  chartApi,
  zones,
  showOb,
  showFvg,
  showConfluence,
  showStopLines = true,
  halfTpLabel = false,
  className,
}: PatternOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

      const visible = zones.filter((z) => {
        if (z.kind === "ob" && !showOb) return false;
        if (z.kind === "fvg" && !showFvg) return false;
        if (showConfluence && z.score < 2 && !z.htfOverlap) {
          // still draw faded if toggles allow; confluence mode emphasizes overlap
        }
        return true;
      });

      for (const z of visible) {
        drawZone(ctx, chartApi, z, w, showConfluence, showStopLines, halfTpLabel);
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
  }, [
    chartApi,
    zones,
    showOb,
    showFvg,
    showConfluence,
    showStopLines,
    halfTpLabel,
  ]);

  if (!showOb && !showFvg) return null;

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

function drawZone(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  z: EasyZone,
  canvasW: number,
  emphasizeConfluence: boolean,
  showStop: boolean,
  halfTp: boolean
) {
  const x0 =
    api.chart.timeScale().timeToCoordinate(z.extendFrom as Time) ??
    api.chart.timeScale().timeToCoordinate(z.startTime as Time);
  const yTop = api.series.priceToCoordinate(z.priceTop);
  const yBot = api.series.priceToCoordinate(z.priceBottom);
  if (x0 == null || yTop == null || yBot == null) return;

  const x1 = canvasW - 8;
  if (x1 <= x0) return;

  const strong = z.htfOverlap || z.score >= 3;
  const fade = emphasizeConfluence && !strong && z.score < 2;
  const alpha = fade ? 0.08 : strong ? 0.32 : 0.16;
  const strokeA = fade ? 0.25 : strong ? 0.95 : 0.55;

  const bull = z.bias === "bullish";
  const fill =
    z.kind === "ob"
      ? bull
        ? `rgba(56,189,248,${alpha})`
        : `rgba(251,113,133,${alpha})`
      : bull
        ? `rgba(52,211,153,${alpha})`
        : `rgba(192,132,252,${alpha})`;
  const stroke =
    z.kind === "ob"
      ? bull
        ? `rgba(56,189,248,${strokeA})`
        : `rgba(251,113,133,${strokeA})`
      : bull
        ? `rgba(52,211,153,${strokeA})`
        : `rgba(192,132,252,${strokeA})`;

  const top = Math.min(yTop, yBot);
  const height = Math.abs(yBot - yTop);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strong ? 2 : 1;
  ctx.beginPath();
  ctx.rect(x0, top, x1 - x0, Math.max(height, 1));
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = stroke;
  ctx.font = "9px ui-monospace, monospace";
  const label = `${z.kind.toUpperCase()} ${bull ? "↑" : "↓"} · ${z.score}${
    z.htfOverlap ? " HTF" : ""
  }`;
  ctx.fillText(label, x0 + 3, top + 10);

  if (halfTp && z.touched) {
    ctx.fillStyle = "rgba(250,204,21,0.85)";
    ctx.fillText("½TP", x0 + 3, top + 22);
  }

  if (showStop && z.stopPrice != null) {
    const ys = api.series.priceToCoordinate(z.stopPrice);
    if (ys != null) {
      ctx.strokeStyle = `rgba(248,250,252,${strokeA * 0.7})`;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, ys);
      ctx.lineTo(x1, ys);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
