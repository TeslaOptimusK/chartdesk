"use client";

import { useEffect, useRef } from "react";
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
import type { Candle, Drawing, PatternHit } from "@/lib/types";
import { bollinger, ema, rsi, sma } from "@/lib/indicators";
import type { IndicatorId } from "@/lib/store";

interface ChartCanvasProps {
  candles: Candle[];
  indicators: IndicatorId[];
  patternHits?: PatternHit[];
  drawings?: Drawing[];
  drawingTool?: "none" | "trend" | "horizontal";
  onAddDrawing?: (drawing: Omit<Drawing, "id" | "createdAt">) => void;
  height?: number;
  className?: string;
}

export function ChartCanvas({
  candles,
  indicators,
  patternHits = [],
  drawings = [],
  drawingTool = "none",
  onAddDrawing,
  height = 420,
  className,
}: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlayRefs = useRef<ISeriesApi<"Line">[]>([]);
  const pendingPoint = useRef<{ time: number; price: number } | null>(null);
  const symbolIdRef = useRef<string>("");

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

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
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
        color: c.close >= c.open ? "rgba(45,212,168,0.35)" : "rgba(240,113,120,0.35)",
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

  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || !onAddDrawing) return;

    const handler = (param: {
      point?: { x: number; y: number };
      time?: Time;
    }) => {
      if (drawingTool === "none" || !param.point || param.time == null) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;
      const point = { time: Number(param.time), price };
      if (drawingTool === "horizontal") {
        onAddDrawing({
          symbolId: symbolIdRef.current || "active",
          tool: "horizontal",
          points: [point],
          color: "#fbbf24",
        });
        return;
      }
      if (!pendingPoint.current) {
        pendingPoint.current = point;
      } else {
        onAddDrawing({
          symbolId: symbolIdRef.current || "active",
          tool: "trend",
          points: [pendingPoint.current, point],
          color: "#38bdf8",
        });
        pendingPoint.current = null;
      }
    };

    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [drawingTool, onAddDrawing]);

  // Drawings as simple line overlays
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || candles.length === 0) return;
    const temp: ISeriesApi<"Line">[] = [];
    for (const d of drawings) {
      if (d.tool === "horizontal" && d.points[0]) {
        const series = chart.addSeries(LineSeries, {
          color: d.color,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        series.setData([
          { time: candles[0].time as Time, value: d.points[0].price },
          {
            time: candles[candles.length - 1].time as Time,
            value: d.points[0].price,
          },
        ]);
        temp.push(series);
      }
      if (d.tool === "trend" && d.points.length >= 2) {
        const series = chart.addSeries(LineSeries, {
          color: d.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        series.setData(
          d.points.map((p) => ({ time: p.time as Time, value: p.price }))
        );
        temp.push(series);
      }
    }
    return () => {
      for (const s of temp) chart.removeSeries(s);
    };
  }, [drawings, candles]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height }}
      data-testid="chart-canvas"
    />
  );
}
