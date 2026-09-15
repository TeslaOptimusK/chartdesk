"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import {
  DrawingOverlay,
  type ChartApiBundle,
} from "@/components/chart/DrawingOverlay";
import type {
  Candle,
  ChartSettings,
  ChartStyle,
  Drawing,
  DrawingTool,
  PatternHit,
} from "@/lib/types";
import { DEFAULT_CHART_SETTINGS } from "@/lib/types";
import {
  atr,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  toHeikinAshi,
  vwap,
} from "@/lib/indicators";
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
  chartStyle?: ChartStyle;
  compareCandles?: Candle[];
  compareLabel?: string;
  magnet?: boolean;
  goToDate?: string | null;
  height?: number;
  className?: string;
  chartSettings?: ChartSettings;
  locked?: boolean;
}

type AnySeries = ISeriesApi<SeriesType>;

interface LegendState {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  chartStyle = "candle",
  compareCandles,
  compareLabel,
  magnet = true,
  goToDate = null,
  height = 420,
  className,
  chartSettings = DEFAULT_CHART_SETTINGS,
  locked = false,
}: ChartCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<AnySeries | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlayRefs = useRef<AnySeries[]>([]);
  const [chartApi, setChartApi] = useState<ChartApiBundle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legend, setLegend] = useState<LegendState | null>(null);

  const displayCandles = useMemo(
    () => (chartStyle === "heikin_ashi" ? toHeikinAshi(candles) : candles),
    [candles, chartStyle]
  );

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: {
          type: ColorType.Solid,
          color: chartSettings.background,
        },
        textColor: "#9aa7b5",
        fontFamily: "var(--font-chart-mono), ui-monospace, monospace",
      },
      grid: {
        vertLines: {
          color: chartSettings.showGrid ? chartSettings.gridColor : "transparent",
        },
        horzLines: {
          color: chartSettings.showGrid ? chartSettings.gridColor : "transparent",
        },
      },
      crosshair: {
        vertLine: { color: "#3d4f63", labelBackgroundColor: "#1c2836" },
        horzLine: { color: "#3d4f63", labelBackgroundColor: "#1c2836" },
      },
      rightPriceScale: { borderColor: "#1e2a38" },
      timeScale: { borderColor: "#1e2a38", timeVisible: true },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    volumeRef.current = volumeSeries;

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
      mainSeriesRef.current = null;
      volumeRef.current = null;
    };
    // chartSettings applied in separate effect after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Feature ID: chart.settings — live apply colors/grid
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: {
        background: {
          type: ColorType.Solid,
          color: chartSettings.background,
        },
      },
      grid: {
        vertLines: {
          color: chartSettings.showGrid ? chartSettings.gridColor : "transparent",
        },
        horzLines: {
          color: chartSettings.showGrid ? chartSettings.gridColor : "transparent",
        },
      },
    });
  }, [chartSettings]);

  // Recreate main series when chart style changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
    }

    let series: AnySeries;
    if (chartStyle === "line") {
      series = chart.addSeries(LineSeries, {
        color: "#38bdf8",
        lineWidth: 2,
        priceLineVisible: false,
      });
    } else if (chartStyle === "area") {
      series = chart.addSeries(AreaSeries, {
        lineColor: "#38bdf8",
        topColor: "rgba(56,189,248,0.35)",
        bottomColor: "rgba(56,189,248,0.02)",
        lineWidth: 2,
      });
    } else if (chartStyle === "bar") {
      series = chart.addSeries(BarSeries, {
        upColor: chartSettings.upColor,
        downColor: chartSettings.downColor,
      });
    } else {
      series = chart.addSeries(CandlestickSeries, {
        upColor: chartSettings.upColor,
        downColor: chartSettings.downColor,
        borderUpColor: chartSettings.upColor,
        borderDownColor: chartSettings.downColor,
        wickUpColor: chartSettings.upColor,
        wickDownColor: chartSettings.downColor,
      });
    }
    mainSeriesRef.current = series;
    setChartApi({ chart, series: series as ISeriesApi<"Candlestick"> });
  }, [chartStyle, chartSettings.upColor, chartSettings.downColor]);

  // Data + indicators
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    const volumeSeries = volumeRef.current;
    if (!chart || !main || !volumeSeries || displayCandles.length === 0) return;

    if (chartStyle === "line" || chartStyle === "area") {
      (main as ISeriesApi<"Line">).setData(
        displayCandles.map((c) => ({
          time: c.time as Time,
          value: c.close,
        }))
      );
    } else {
      (main as ISeriesApi<"Candlestick">).setData(
        displayCandles.map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    }

    volumeSeries.setData(
      displayCandles.map((c) => ({
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

    const closes = displayCandles.map((c) => c.close);
    const addLine = (
      values: (number | null)[],
      color: string,
      scaleId?: string
    ) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: scaleId,
      });
      if (scaleId) {
        chart.priceScale(scaleId).applyOptions({
          scaleMargins: { top: 0.72, bottom: 0.02 },
        });
      }
      series.setData(
        displayCandles
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
      const bb = bollinger(displayCandles);
      addLine(bb.upper, "#64748b");
      addLine(bb.mid, "#94a3b8");
      addLine(bb.lower, "#64748b");
    }
    if (indicators.includes("vwap")) addLine(vwap(displayCandles), "#e8b86d");
    if (indicators.includes("rsi")) addLine(rsi(displayCandles, 14), "#c084fc", "rsi");
    if (indicators.includes("atr")) addLine(atr(displayCandles, 14), "#fb7185", "atr");
    if (indicators.includes("macd")) {
      const m = macd(displayCandles);
      const hist = chart.addSeries(HistogramSeries, {
        priceScaleId: "macd",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      chart.priceScale("macd").applyOptions({
        scaleMargins: { top: 0.78, bottom: 0.02 },
      });
      hist.setData(
        displayCandles
          .map((c, i) =>
            m.hist[i] == null
              ? null
              : {
                  time: c.time as Time,
                  value: m.hist[i]!,
                  color:
                    m.hist[i]! >= 0
                      ? "rgba(45,212,168,0.5)"
                      : "rgba(240,113,120,0.5)",
                }
          )
          .filter(
            (x): x is { time: Time; value: number; color: string } => x != null
          )
      );
      overlayRefs.current.push(hist);
      addLine(m.macd, "#38bdf8", "macd");
      addLine(m.signal, "#fbbf24", "macd");
    }
    if (indicators.includes("volMa")) {
      const vols = displayCandles.map((c) => c.volume);
      const ma = sma(vols, 20);
      const series = chart.addSeries(LineSeries, {
        color: "#a78bfa",
        lineWidth: 2,
        priceScaleId: "vol",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(
        displayCandles
          .map((c, i) =>
            ma[i] == null ? null : { time: c.time as Time, value: ma[i]! }
          )
          .filter((x): x is { time: Time; value: number } => x != null)
      );
      overlayRefs.current.push(series);
    }

    // Compare overlay (normalized to primary first close)
    if (compareCandles && compareCandles.length > 0 && displayCandles[0]) {
      const base0 = displayCandles[0].close;
      const cmp0 = compareCandles[0].close || 1;
      const series = chart.addSeries(LineSeries, {
        color: "#f472b6",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: compareLabel ?? "CMP",
      });
      const byTime = new Map(compareCandles.map((c) => [c.time, c.close]));
      series.setData(
        displayCandles
          .map((c) => {
            const v = byTime.get(c.time);
            if (v == null) return null;
            return {
              time: c.time as Time,
              value: (v / cmp0) * base0,
            };
          })
          .filter((x): x is { time: Time; value: number } => x != null)
      );
      overlayRefs.current.push(series);
    }

    if (chartStyle === "candle" || chartStyle === "heikin_ashi" || chartStyle === "bar") {
      const markers: SeriesMarker<Time>[] = patternHits.map((h) => ({
        time: h.toTs as Time,
        position: "aboveBar",
        color: "#38bdf8",
        shape: "arrowDown",
        text: h.label,
      }));
      createSeriesMarkers(main as ISeriesApi<"Candlestick">, markers);
    }

    chart.timeScale().fitContent();
    const last = displayCandles[displayCandles.length - 1];
    if (last) {
      setLegend({
        time: last.time,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: last.volume,
      });
    }
  }, [
    displayCandles,
    indicators,
    patternHits,
    chartStyle,
    compareCandles,
    compareLabel,
  ]);

  // Crosshair legend
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: {
      time?: Time;
      seriesData: Map<AnySeries, unknown>;
    }) => {
      if (!param.time) return;
      const t = Number(param.time);
      const c = displayCandles.find((x) => x.time === t);
      if (!c) return;
      setLegend({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    };
    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [displayCandles]);

  // Go to date
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !goToDate || displayCandles.length === 0) return;
    const target = Math.floor(new Date(goToDate).getTime() / 1000);
    let nearest = displayCandles[0];
    let best = Math.abs(nearest.time - target);
    for (const c of displayCandles) {
      const d = Math.abs(c.time - target);
      if (d < best) {
        best = d;
        nearest = c;
      }
    }
    const from = Math.max(
      displayCandles[0].time,
      nearest.time - 40 * (displayCandles[1]?.time - displayCandles[0].time || 86400)
    );
    const to = Math.min(
      displayCandles[displayCandles.length - 1].time,
      nearest.time + 10 * (displayCandles[1]?.time - displayCandles[0].time || 86400)
    );
    chart.timeScale().setVisibleRange({
      from: from as Time,
      to: to as Time,
    });
  }, [goToDate, displayCandles]);

  useEffect(() => {
    if (drawingTool !== "none") setSelectedId(null);
  }, [drawingTool]);

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full", className)}
      style={{ height }}
      data-testid="chart-canvas"
      data-drawing-tool={drawingTool}
      data-chart-style={chartStyle}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {legend && (
        <div
          className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-[var(--workspace-muted)]"
          data-feature="chart.status_line"
        >
          <span className="mr-2 text-[var(--workspace-fg)]">
            {new Date(legend.time * 1000).toLocaleString()}
          </span>
          O {legend.open.toFixed(2)} H {legend.high.toFixed(2)} L{" "}
          {legend.low.toFixed(2)} C{" "}
          <span
            className={
              legend.close >= legend.open ? "text-emerald-300" : "text-rose-300"
            }
          >
            {legend.close.toFixed(2)}
          </span>
          {(() => {
            const idx = displayCandles.findIndex((c) => c.time === legend.time);
            const prev =
              idx > 0
                ? displayCandles[idx - 1]
                : displayCandles.length > 1
                  ? displayCandles[displayCandles.length - 2]
                  : null;
            if (!prev || !prev.close) return null;
            const chg = ((legend.close - prev.close) / prev.close) * 100;
            return (
              <span
                className={
                  chg >= 0 ? "ml-1 text-emerald-300" : "ml-1 text-rose-300"
                }
              >
                {chg >= 0 ? "+" : ""}
                {chg.toFixed(3)}%
              </span>
            );
          })()}{" "}
          V {(legend.volume / 1e6).toFixed(2)}M
          {compareLabel && (
            <span className="ml-2 text-pink-300">vs {compareLabel}</span>
          )}
        </div>
      )}
      <DrawingOverlay
        chartApi={chartApi}
        symbolId={symbolId}
        drawings={drawings}
        tool={drawingTool}
        onAddDrawing={onAddDrawing}
        onDeleteDrawing={onDeleteDrawing}
        selectedId={selectedId}
        onSelectDrawing={setSelectedId}
        candles={displayCandles}
        magnet={magnet}
        locked={locked}
      />
      {drawingTool !== "none" && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-20 rounded bg-black/55 px-2 py-1 text-[10px] text-[var(--workspace-muted)]">
          드로잉: {drawingTool}
          {magnet ? " · 자석 ON" : ""}
          {locked ? " · 잠금" : ""} · Esc 취소 · Del 삭제
        </div>
      )}
    </div>
  );
}
