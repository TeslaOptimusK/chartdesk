"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import {
  DrawingOverlay,
  type ChartApiBundle,
} from "@/components/chart/DrawingOverlay";
import type { Candle, Drawing, DrawingTool, PatternHit } from "@/lib/types";
import { bollinger, ema, rsi, sma } from "@/lib/indicators";
import type { IndicatorId } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ChartCanvasProps {
  symbolId: string;
  candles: Candle[];
  indicators: IndicatorId[];
  patternHits?: PatternHit[];
  drawings?: Drawing[];
  drawingTool?: DrawingTool;
  onAddDrawing?: (drawing: Omit<Drawing, "id" | "createdAt">) => void;
  onDeleteDrawing?: (id: string) => void;
  height?: number;
  className?: string;
}

export function ChartCanvas({
  symbolId,
  candles,
  indicators,
  patternHits = [],
  drawings = [],
  drawingTool = "none",
  onAddDrawing,
  onDeleteDrawing,
  height = 420,
  className,
}: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlayRefs = useRef<ISeriesApi<"Line">[]>([]);
  const [chartApi, setChartApi] = useState<ChartApiBundle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#0c1219" },
        textColor: "#9aa7b5",
        fontFamily: "var(--font-chart-mono), ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "#16202b" },
        horzLines: { color: "#16202b" },
      },
      crosshair: {
        vertLine: { color: "#3d4f63", labelBackgroundColor: "#1c2836" },
        horzLine: { color: "#3d4f63", labelBackgroundColor: "#1c2836" },
      },
      rightPriceScale: { borderColor: "#1e2a38" },
      timeScale: { borderColor: "#1e2a38", timeVisible: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#2dd4a8",
      downColor: "#f07178",
      borderUpColor: "#2dd4a8",
      borderDownColor: "#f07178",
      wickUpColor: "#2dd4a8",
      wickDownColor: "#f07178",
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeRef.current = volumeSeries;
    setChartApi({ chart, series: candleSeries });

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      setChartApi(null);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeRef.current;
    const chart = chartRef.current;
    if (!candleSeries || !volumeSeries || !chart || candles.length === 0) return;

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(45,212,168,0.35)"
            : "rgba(240,113,120,0.35)",
      }))
    );

    for (const s of overlayRefs.current) {
      chart.removeSeries(s);
    }
    overlayRefs.current = [];

    const closes = candles.map((c) => c.close);
    const addLine = (values: (number | null)[], color: string) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(
        candles
          .map((c, i) =>
            values[i] == null
              ? null
              : { time: c.time as Time, value: values[i]! }
          )
          .filter((x): x is { time: Time; value: number } => x != null)
      );
      overlayRefs.current.push(series);
    };

    if (indicators.includes("sma20")) addLine(sma(closes, 20), "#fbbf24");
    if (indicators.includes("ema9")) addLine(ema(closes, 9), "#38bdf8");
    if (indicators.includes("bb")) {
      const bb = bollinger(candles);
      addLine(bb.upper, "#64748b");
      addLine(bb.mid, "#94a3b8");
      addLine(bb.lower, "#64748b");
    }
    if (indicators.includes("rsi")) {
      const values = rsi(candles, 14);
      const series = chart.addSeries(LineSeries, {
        color: "#c084fc",
        lineWidth: 2,
        priceScaleId: "rsi",
        priceLineVisible: false,
        lastValueVisible: true,
      });
      chart.priceScale("rsi").applyOptions({
        scaleMargins: { top: 0.75, bottom: 0.05 },
      });
      series.setData(
        candles
          .map((c, i) =>
            values[i] == null
              ? null
              : { time: c.time as Time, value: values[i]! }
          )
          .filter((x): x is { time: Time; value: number } => x != null)
      );
      overlayRefs.current.push(series);
    }

    const markers: SeriesMarker<Time>[] = patternHits.map((h) => ({
      time: h.toTs as Time,
      position: "aboveBar",
      color: "#38bdf8",
      shape: "arrowDown",
      text: h.label,
    }));
    createSeriesMarkers(candleSeries, markers);
    chart.timeScale().fitContent();
  }, [candles, indicators, patternHits]);

  // Reset pending selection when tool changes
  useEffect(() => {
    if (drawingTool !== "none") setSelectedId(null);
  }, [drawingTool]);

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height }}
      data-testid="chart-canvas"
      data-drawing-tool={drawingTool}
    >
      <div ref={containerRef} className="absolute inset-0" />
      <DrawingOverlay
        chartApi={chartApi}
        symbolId={symbolId}
        drawings={drawings}
        tool={drawingTool}
        onAddDrawing={onAddDrawing}
        onDeleteDrawing={onDeleteDrawing}
        selectedId={selectedId}
        onSelectDrawing={setSelectedId}
      />
      {drawingTool !== "none" && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-20 rounded bg-black/55 px-2 py-1 text-[10px] text-[var(--workspace-muted)]">
          드로잉: {drawingTool} · Esc 취소 · Del 선택 삭제
        </div>
      )}
    </div>
  );
}
