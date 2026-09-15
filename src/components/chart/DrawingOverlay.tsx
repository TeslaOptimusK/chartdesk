"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type {
  Candle,
  Drawing,
  DrawingKind,
  DrawingPoint,
  DrawingTool,
} from "@/lib/types";
import {
  channelOffset,
  clicksRequired,
  defaultColor,
  fibPrices,
  FIB_LEVELS,
} from "@/lib/drawings";
import { snapToCandle } from "@/lib/indicators";

export type ChartApiBundle = {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area">;
};

/** @deprecated alias — prefer ChartApiBundle */
export type ChartBundle = ChartApiBundle;

interface DrawingOverlayProps {
  chartApi: ChartApiBundle | null;
  symbolId: string;
  drawings: Drawing[];
  tool: DrawingTool;
  onAddDrawing?: (drawing: Omit<Drawing, "id" | "createdAt">) => void;
  onDeleteDrawing?: (id: string) => void;
  selectedId?: string | null;
  onSelectDrawing?: (id: string | null) => void;
  candles?: Candle[];
  magnet?: boolean;
  /** Feature ID: draw.lock_all */
  locked?: boolean;
}

function pointToXY(
  api: ChartApiBundle,
  point: DrawingPoint
): { x: number; y: number } | null {
  const x = api.chart.timeScale().timeToCoordinate(point.time as Time);
  const y = api.series.priceToCoordinate(point.price);
  if (x == null || y == null) return null;
  return { x, y };
}

export function DrawingOverlay({
  chartApi,
  symbolId,
  drawings,
  tool,
  onAddDrawing,
  onDeleteDrawing,
  selectedId,
  onSelectDrawing,
  candles = [],
  magnet = false,
  locked = false,
}: DrawingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingRef = useRef<DrawingPoint[]>([]);
  const [pending, setPending] = useState<DrawingPoint[]>([]);
  const [cursor, setCursor] = useState<DrawingPoint | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    pendingRef.current = [];
    setPending([]);
    setCursor(null);
  }, [tool, symbolId]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartApi) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    for (const d of drawings) {
      paintDrawing(ctx, chartApi, d, d.id === selectedId, w);
    }

    if (tool !== "none" && pending.length > 0) {
      const previewPoints =
        cursor &&
        tool !== "horizontal" &&
        tool !== "horizontal_ray" &&
        tool !== "text"
          ? [...pending, cursor]
          : pending;
      paintDrawing(
        ctx,
        chartApi,
        {
          id: "preview",
          symbolId,
          tool,
          points: previewPoints,
          color: defaultColor(tool),
          text: tool === "text" ? "…" : undefined,
          createdAt: "",
        },
        true,
        w
      );
      for (const p of pending) {
        const xy = pointToXY(chartApi, p);
        if (!xy) continue;
        ctx.beginPath();
        ctx.fillStyle = "#e8b86d";
        ctx.arc(xy.x, xy.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [chartApi, drawings, pending, cursor, tool, symbolId, selectedId]);

  useEffect(() => {
    redraw();
  }, [redraw, tick]);

  useEffect(() => {
    if (!chartApi) return;
    const bump = () => setTick((n) => n + 1);
    const ts = chartApi.chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(bump);
    chartApi.chart.subscribeCrosshairMove(bump);
    window.addEventListener("resize", bump);
    const ro = new ResizeObserver(bump);
    if (canvasRef.current?.parentElement) {
      ro.observe(canvasRef.current.parentElement);
    }
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(bump);
      chartApi.chart.unsubscribeCrosshairMove(bump);
      window.removeEventListener("resize", bump);
      ro.disconnect();
    };
  }, [chartApi]);

  const eventToPoint = (e: React.MouseEvent): DrawingPoint | null => {
    if (!chartApi || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = chartApi.chart.timeScale().coordinateToTime(x);
    const price = chartApi.series.coordinateToPrice(y);
    if (time == null || price == null) return null;
    const raw = { time: Number(time), price };
    return magnet && candles.length ? snapToCandle(candles, raw.time, raw.price) : raw;
  };

  const finish = (points: DrawingPoint[], kind: DrawingKind, text?: string) => {
    onAddDrawing?.({
      symbolId,
      tool: kind,
      points,
      color: defaultColor(kind),
      text,
    });
    pendingRef.current = [];
    setPending([]);
    setCursor(null);
  };

  const onClick = (e: React.MouseEvent) => {
    if (locked) return;
    if (tool === "none") {
      onSelectDrawing?.(null);
      return;
    }
    const point = eventToPoint(e);
    if (!point) return;

    if (
      tool === "horizontal" ||
      tool === "horizontal_ray" ||
      tool === "vertical"
    ) {
      finish([point], tool);
      return;
    }
    if (tool === "text") {
      const text = window.prompt("차트 메모", "메모");
      if (text == null || !text.trim()) return;
      finish([point], "text", text.trim());
      return;
    }

    const next = [...pendingRef.current, point];
    const need = clicksRequired(tool);
    if (next.length >= need) {
      finish(next.slice(0, need), tool);
    } else {
      pendingRef.current = next;
      setPending(next);
    }
  };

  const onMove = (e: React.MouseEvent) => {
    if (tool === "none" || pendingRef.current.length === 0) {
      setCursor(null);
      return;
    }
    setCursor(eventToPoint(e));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      pendingRef.current = [];
      setPending([]);
      setCursor(null);
      onSelectDrawing?.(null);
    }
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      selectedId &&
      !locked
    ) {
      onDeleteDrawing?.(selectedId);
      onSelectDrawing?.(null);
    }
  };

  const active = tool !== "none" && !locked;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 h-full w-full"
      style={{
        pointerEvents: active ? "auto" : "none",
        cursor: active ? "crosshair" : "default",
      }}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={() => setCursor(null)}
      onKeyDown={onKeyDown}
      tabIndex={0}
      data-testid="drawing-overlay"
      aria-label="차트 드로잉 레이어"
    />
  );
}

function paintDrawing(
  ctx: CanvasRenderingContext2D,
  api: ChartApiBundle,
  d: Drawing,
  highlight: boolean,
  width: number
) {
  const color = d.color || "#94a3b8";
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = highlight ? 2.5 : 1.5;
  ctx.setLineDash([]);

  if (d.tool === "horizontal" && d.points[0]) {
    const y = api.series.priceToCoordinate(d.points[0].price);
    if (y == null) {
      ctx.restore();
      return;
    }
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Feature ID: draw.horizontal_ray — from anchor time rightward at price
  if (d.tool === "horizontal_ray" && d.points[0]) {
    const y = api.series.priceToCoordinate(d.points[0].price);
    const x = api.chart.timeScale().timeToCoordinate(d.points[0].time as Time);
    if (y == null) {
      ctx.restore();
      return;
    }
    const startX = x == null ? 0 : x;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(width + 40, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(startX, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (d.tool === "vertical" && d.points[0]) {
    const x = api.chart.timeScale().timeToCoordinate(d.points[0].time as Time);
    if (x == null) {
      ctx.restore();
      return;
    }
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ctx.canvas.clientHeight || 800);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if ((d.tool === "trend" || d.tool === "ray") && d.points.length >= 2) {
    const a = pointToXY(api, d.points[0]);
    const b = pointToXY(api, d.points[1]);
    if (a && b) {
      if (d.tool === "ray") {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const scale = Math.max(width, 1200) / len;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + dx * scale, a.y + dy * scale);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (d.tool === "measure" && d.points.length >= 2) {
    const a = pointToXY(api, d.points[0]);
    const b = pointToXY(api, d.points[1]);
    if (a && b) {
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const bars = Math.round(
        Math.abs(d.points[1].time - d.points[0].time) / 86400
      );
      const dp = d.points[1].price - d.points[0].price;
      const pct = (dp / d.points[0].price) * 100;
      const label = `${dp >= 0 ? "+" : ""}${dp.toFixed(2)} (${pct.toFixed(2)}%) · ~${bars}d`;
      ctx.setLineDash([]);
      ctx.font = "11px ui-monospace, monospace";
      const tw = ctx.measureText(label).width;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.fillStyle = "rgba(10,14,20,0.85)";
      roundRect(ctx, mx - tw / 2 - 6, my - 16, tw + 12, 20, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(label, mx - tw / 2, my - 2);
    }
    ctx.restore();
    return;
  }

  if (d.tool === "channel" && d.points.length >= 2) {
    const [p0, p1, p2] = d.points;
    const a = pointToXY(api, p0);
    const b = pointToXY(api, p1);
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (p2) {
        const off = channelOffset(p0, p1, p2);
        const c = pointToXY(api, { time: p0.time, price: p0.price + off });
        const e = pointToXY(api, { time: p1.time, price: p1.price + off });
        if (c && e) {
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(e.x, e.y);
          ctx.stroke();
          ctx.globalAlpha = 0.12;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(e.x, e.y);
          ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.55;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(e.x, e.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    return;
  }

  if (d.tool === "fibonacci" && d.points.length >= 2) {
    const [p0, p1] = d.points;
    const prices = fibPrices(p0, p1);
    const x0 = api.chart.timeScale().timeToCoordinate(p0.time as Time);
    const x1 = api.chart.timeScale().timeToCoordinate(p1.time as Time);
    if (x0 == null || x1 == null) {
      ctx.restore();
      return;
    }
    const left = Math.min(x0, x1);
    const right = Math.max(x0, x1);
    const span = Math.max(90, right - left);
    prices.forEach((price, i) => {
      const y = api.series.priceToCoordinate(price);
      if (y == null) return;
      const lvl = FIB_LEVELS[i];
      ctx.globalAlpha = lvl === 0.5 ? 0.95 : 0.7;
      ctx.setLineDash(lvl === 0.5 ? [] : [4, 3]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + span, y);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(
        `${(lvl * 100).toFixed(1)}%  ${price.toFixed(2)}`,
        left + 4,
        y - 3
      );
    });
    const a = pointToXY(api, p0);
    const b = pointToXY(api, p1);
    if (a && b) {
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (d.tool === "rectangle" && d.points.length >= 2) {
    const [p0, p1] = d.points;
    const a = pointToXY(api, p0);
    const b = pointToXY(api, { time: p1.time, price: p0.price });
    const c = pointToXY(api, p1);
    const e = pointToXY(api, { time: p0.time, price: p1.price });
    if (a && b && c && e) {
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (d.tool === "text" && d.points[0]) {
    const xy = pointToXY(api, d.points[0]);
    if (xy) {
      const label = d.text || "메모";
      ctx.font = "12px IBM Plex Sans, sans-serif";
      const padX = 8;
      const padY = 5;
      const tw = ctx.measureText(label).width;
      const boxW = tw + padX * 2;
      const boxH = 22;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = "rgba(14, 20, 28, 0.92)";
      roundRect(ctx, xy.x, xy.y - boxH, boxW, boxH, 4);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, xy.x + padX, xy.y - padY - 4);
      ctx.beginPath();
      ctx.arc(xy.x, xy.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
