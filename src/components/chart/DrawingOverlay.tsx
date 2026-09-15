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
  isBrushTool,
} from "@/lib/drawings";
import { snapToCandle } from "@/lib/indicators";
import { anchoredVwap, volumeProfile } from "@/lib/indicators-extra";

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
  /** Feature ID: draw.stay_in_mode */
  stayInDrawMode?: boolean;
  /** Raw candles for VP / anchored VWAP (unscaled) */
  candlesFull?: Candle[];
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
  stayInDrawMode = false,
  candlesFull,
}: DrawingOverlayProps) {
  const profileCandles = candlesFull?.length ? candlesFull : candles;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingRef = useRef<DrawingPoint[]>([]);
  const [pending, setPending] = useState<DrawingPoint[]>([]);
  const [cursor, setCursor] = useState<DrawingPoint | null>(null);
  const [tick, setTick] = useState(0);
  const brushingRef = useRef(false);
  const brushPointsRef = useRef<DrawingPoint[]>([]);

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
      paintDrawing(ctx, chartApi, d, d.id === selectedId, w, profileCandles);
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
        w,
        profileCandles
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
  }, [
    chartApi,
    drawings,
    pending,
    cursor,
    tool,
    symbolId,
    selectedId,
    profileCandles,
  ]);

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
    if (!stayInDrawMode) {
      pendingRef.current = [];
      setPending([]);
      setCursor(null);
    } else {
      pendingRef.current = [];
      setPending([]);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (locked || tool === "none" || !isBrushTool(tool)) return;
    const point = eventToPoint(e);
    if (!point) return;
    brushingRef.current = true;
    brushPointsRef.current = [point];
    setPending([point]);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!brushingRef.current || tool !== "brush" || locked) return;
    brushingRef.current = false;
    const point = eventToPoint(e);
    const pts = brushPointsRef.current;
    if (point && pts.length) pts.push(point);
    if (pts.length >= 2) {
      finish(pts, "brush");
    }
    brushPointsRef.current = [];
    setPending([]);
    setCursor(null);
  };

  const onClick = (e: React.MouseEvent) => {
    if (locked) return;
    if (tool === "none") {
      onSelectDrawing?.(null);
      return;
    }
    if (isBrushTool(tool)) return;
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
    if (tool === "none") {
      setCursor(null);
      return;
    }
    if (tool === "brush" && brushingRef.current) {
      const point = eventToPoint(e);
      if (point) {
        brushPointsRef.current = [...brushPointsRef.current, point];
        setPending([...brushPointsRef.current]);
      }
      return;
    }
    if (pendingRef.current.length === 0) {
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
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseMove={onMove}
      onMouseLeave={() => {
        setCursor(null);
        if (brushingRef.current && tool === "brush") {
          brushingRef.current = false;
          if (brushPointsRef.current.length >= 2) {
            finish(brushPointsRef.current, "brush");
          }
          brushPointsRef.current = [];
          setPending([]);
        }
      }}
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
  width: number,
  profileCandles: Candle[]
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

  // Feature ID: draw.extended_line
  if (d.tool === "extended" && d.points.length >= 2) {
    const a = pointToXY(api, d.points[0]);
    const b = pointToXY(api, d.points[1]);
    if (a && b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const scale = Math.max(width, 1200) / len;
      ctx.beginPath();
      ctx.moveTo(a.x - dx * scale, a.y - dy * scale);
      ctx.lineTo(a.x + dx * scale, a.y + dy * scale);
      ctx.stroke();
    }
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

  // Feature ID: draw.pitchfork
  if (d.tool === "pitchfork" && d.points.length >= 2) {
    const [p0, p1, p2] = d.points;
    const a = pointToXY(api, p0);
    const b = pointToXY(api, p1);
    const c = pointToXY(api, p2 ?? p1);
    if (a && b && c) {
      const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
      const lines = [
        [a, mid],
        [a, b],
        [a, c],
      ] as const;
      ctx.setLineDash([5, 4]);
      for (const [s, e] of lines) {
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const len = Math.hypot(dx, dy) || 1;
        const scale = Math.max(width, 900) / len;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + dx * scale, s.y + dy * scale);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (
    (d.tool === "fib_extension" || d.tool === "fib_fan" || d.tool === "fib_arc" || d.tool === "fib_timezone") &&
    d.points.length >= 2
  ) {
    const [p0, p1] = d.points;
    const prices = fibPrices(p0, p1);
    const a = pointToXY(api, p0);
    const b = pointToXY(api, p1);
    if (a && b) {
      if (d.tool === "fib_fan") {
        FIB_LEVELS.slice(1, 5).forEach((lvl) => {
          const y = a.y + (b.y - a.y) * lvl;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(width, y);
          ctx.stroke();
        });
      } else if (d.tool === "fib_arc") {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (d.tool === "fib_timezone") {
        const t0 = p0.time;
        const t1 = p1.time;
        const span = Math.abs(t1 - t0) || 86400;
        FIB_LEVELS.forEach((lvl) => {
          const t = p0.time + span * lvl;
          const x = api.chart.timeScale().timeToCoordinate(t as Time);
          if (x == null) return;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, ctx.canvas.clientHeight || 400);
          ctx.stroke();
        });
      } else {
        const ext = [1, 1.272, 1.618, 2.618];
        ext.forEach((lvl) => {
          const price = p0.price + (p1.price - p0.price) * lvl;
          const y = api.series.priceToCoordinate(price);
          if (y == null) return;
          ctx.beginPath();
          ctx.moveTo(a.x, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        });
      }
    }
    ctx.restore();
    return;
  }

  if (d.tool === "gann_box" && d.points.length >= 2) {
    const [p0, p1] = d.points;
    const a = pointToXY(api, p0);
    const c = pointToXY(api, p1);
    if (a && c) {
      const b = pointToXY(api, { time: p1.time, price: p0.price });
      const e = pointToXY(api, { time: p0.time, price: p1.price });
      if (b && e) {
        ctx.strokeRect(
          Math.min(a.x, c.x),
          Math.min(a.y, c.y),
          Math.abs(c.x - a.x),
          Math.abs(c.y - a.y)
        );
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }
    }
    ctx.restore();
    return;
  }

  if (d.tool === "gann_fan" && d.points.length >= 2) {
    const a = pointToXY(api, d.points[0]);
    const b = pointToXY(api, d.points[1]);
    if (a && b) {
      [1, 2, 3, 4].forEach((n) => {
        const y = a.y + ((b.y - a.y) / 4) * n;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(width, y);
        ctx.stroke();
      });
    }
    ctx.restore();
    return;
  }

  if (
    (d.tool === "pattern_harmonic" || d.tool === "pattern_elliott") &&
    d.points.length >= 2
  ) {
    ctx.setLineDash([]);
    for (let i = 0; i < d.points.length - 1; i++) {
      const a = pointToXY(api, d.points[i]);
      const b = pointToXY(api, d.points[i + 1]);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.font = "10px ui-monospace";
      ctx.fillText(String.fromCharCode(88 + i), a.x + 4, a.y - 4);
    }
    ctx.restore();
    return;
  }

  if (d.tool === "brush" && d.points.length >= 2) {
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    d.points.forEach((p, i) => {
      const xy = pointToXY(api, p);
      if (!xy) return;
      if (i === 0) ctx.moveTo(xy.x, xy.y);
      else ctx.lineTo(xy.x, xy.y);
    });
    ctx.stroke();
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

  // Feature ID: draw.long_position / draw.short_position
  if (
    (d.tool === "long_position" || d.tool === "short_position") &&
    d.points.length >= 2
  ) {
    const entry = d.points[0];
    const target = d.points[1];
    const stop = d.points[2] ?? {
      time: target.time,
      price: entry.price + (entry.price - target.price) * 0.5,
    };
    const ex = pointToXY(api, entry);
    const tx = pointToXY(api, target);
    const sx = pointToXY(api, stop);
    if (ex && tx) {
      const left = Math.min(ex.x, tx.x) - 20;
      const right = Math.max(ex.x, tx.x) + 20;
      const profitColor =
        d.tool === "long_position" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)";
      const lossColor =
        d.tool === "long_position" ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)";
      const entryY = ex.y;
      const targetY = tx.y;
      const stopY = sx?.y ?? entryY + (entryY - targetY);
      ctx.fillStyle = profitColor;
      ctx.fillRect(left, Math.min(entryY, targetY), right - left, Math.abs(targetY - entryY));
      ctx.fillStyle = lossColor;
      ctx.fillRect(left, Math.min(entryY, stopY), right - left, Math.abs(stopY - entryY));
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(left, entryY);
      ctx.lineTo(right, entryY);
      ctx.stroke();
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = color;
      ctx.fillText(d.tool === "long_position" ? "LONG" : "SHORT", left + 4, entryY - 4);
    }
    ctx.restore();
    return;
  }

  // Feature ID: draw.vp.fixed_range
  if (d.tool === "vp_fixed" && d.points.length >= 2) {
    const [p0, p1] = d.points;
    const x0 = api.chart.timeScale().timeToCoordinate(p0.time as Time);
    const x1 = api.chart.timeScale().timeToCoordinate(p1.time as Time);
    if (x0 != null && x1 != null) {
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      const profile = volumeProfile(profileCandles, p0.time, p1.time, 16);
      const maxV = Math.max(...profile.map((b) => b.volume), 1);
      const barW = Math.min(28, (right - left) / Math.max(profile.length, 1));
      profile.forEach((b, i) => {
        const y = api.series.priceToCoordinate(b.price);
        if (y == null) return;
        const w = (b.volume / maxV) * barW;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = color;
        ctx.fillRect(right + 4, y - 3, w, 6);
        ctx.globalAlpha = 1;
      });
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(left, 0, right - left, ctx.canvas.clientHeight || 400);
    }
    ctx.restore();
    return;
  }

  // Feature ID: draw.anchored_vwap
  if (d.tool === "anchored_vwap" && d.points[0]) {
    const anchor = d.points[0].time;
    const vals = anchoredVwap(profileCandles, anchor);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < profileCandles.length; i++) {
      const c = profileCandles[i];
      const v = vals[i];
      if (v == null) return;
      const xy = pointToXY(api, { time: c.time, price: v });
      if (!xy) return;
      if (!started) {
        ctx.moveTo(xy.x, xy.y);
        started = true;
      } else ctx.lineTo(xy.x, xy.y);
    }
    ctx.strokeStyle = "#e8b86d";
    ctx.lineWidth = 2;
    ctx.stroke();
    const ax = pointToXY(api, d.points[0]);
    if (ax) {
      ctx.beginPath();
      ctx.arc(ax.x, ax.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#e8b86d";
      ctx.fill();
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
