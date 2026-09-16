"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
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
  ChartEventKind,
  ChartEventMarker,
  ChartSettings,
  ChartStyle,
  DateFormat,
  Drawing,
  DrawingTool,
  PatternHit,
  PriceScaleMode as AppScaleMode,
  RangePreset,
  Timeframe,
} from "@/lib/types";
import { DEFAULT_CHART_SETTINGS } from "@/lib/types";
import {
  applyChartTransform,
  volumeIntensity,
} from "@/lib/chart-transforms";
import { runCustomIndicator } from "@/lib/custom-indicator";
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
import {
  anchoredVwap as anchoredVwapSeries,
  ichimoku,
  stochastic,
  stochasticRsi,
  supertrend,
  wma,
} from "@/lib/indicators-extra";
import type { IndicatorId } from "@/lib/store";
import {
  barsForRangePreset,
  formatChartDate,
  secondsToBarClose,
} from "@/lib/chart-time";
import { Phase4ChartOverlay } from "@/components/chart/Phase4ChartOverlay";
import { PatternOverlay } from "@/components/chart/PatternOverlay";
import type { SessionTaggedCandle } from "@/lib/extended-hours";
import type { EasyZone } from "@/lib/easychart";
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
  priceScaleMode?: AppScaleMode;
  rangePreset?: RangePreset;
  dateFormat?: DateFormat;
  extendedHours?: boolean;
  showCountdown?: boolean;
  timeframe?: Timeframe;
  timezone?: string;
  eventMarkers?: ChartEventMarker[];
  eventToggles?: Record<ChartEventKind, boolean>;
  snapshotTick?: number;
  syncCrosshair?: boolean;
  sharedCrosshairTime?: number | null;
  onCrosshairTime?: (t: number | null) => void;
  stayInDrawMode?: boolean;
  /** Feature ID: indicator.on_indicator */
  indicatorOnIndicator?: { parent: string; child: string } | null;
  /** JS custom indicator */
  customIndicatorSource?: string | null;
  /** easychart pattern overlay zones (separate from drawings) */
  easyZones?: EasyZone[];
  easyToggles?: import("@/lib/easychart").EasyOverlayToggles;
  easyOverlayOn?: boolean;
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
  priceScaleMode = "linear",
  rangePreset = "ALL",
  dateFormat = "mm/dd/yyyy",
  extendedHours = false,
  showCountdown = true,
  timeframe = "D",
  timezone = "America/New_York",
  eventMarkers = [],
  eventToggles,
  snapshotTick = 0,
  syncCrosshair = false,
  sharedCrosshairTime = null,
  onCrosshairTime,
  stayInDrawMode = false,
  indicatorOnIndicator = null,
  customIndicatorSource = null,
  easyZones = [],
  easyToggles,
}: ChartCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<AnySeries | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlayRefs = useRef<AnySeries[]>([]);
  const rangeKeyRef = useRef<string>("");
  const stochPaneEnsured = useRef(false);
  const [chartApi, setChartApi] = useState<ChartApiBundle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legend, setLegend] = useState<LegendState | null>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [countdownSec, setCountdownSec] = useState(0);

  const scaledCandles = useMemo(() => {
    const base = candles[0]?.close || 1;
    if (priceScaleMode === "percent") {
      const map = (p: number) => ((p - base) / base) * 100;
      return candles.map((c) => ({
        ...c,
        open: map(c.open),
        high: map(c.high),
        low: map(c.low),
        close: map(c.close),
      }));
    }
    if (priceScaleMode === "indexed_100") {
      const map = (p: number) => (p / base) * 100;
      return candles.map((c) => ({
        ...c,
        open: map(c.open),
        high: map(c.high),
        low: map(c.low),
        close: map(c.close),
      }));
    }
    return candles;
  }, [candles, priceScaleMode]);

  const transformedCandles = useMemo(
    () => applyChartTransform(chartStyle, scaledCandles),
    [scaledCandles, chartStyle]
  );

  const displayCandles = useMemo(
    () =>
      chartStyle === "heikin_ashi"
        ? toHeikinAshi(scaledCandles)
        : transformedCandles,
    [scaledCandles, chartStyle, transformedCandles]
  );

  const volumeWeights = useMemo(
    () => volumeIntensity(displayCandles),
    [displayCandles]
  );

  useEffect(() => {
    if (!showCountdown || displayCandles.length === 0) return;
    const last = displayCandles[displayCandles.length - 1];
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setCountdownSec(secondsToBarClose(now, last.time, timeframe));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [displayCandles, showCountdown, timeframe]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const chart = createChart(el, {
      width: el.clientWidth || undefined,
      height: el.clientHeight || height || 420,
      layout: {
        background: {
          type: ColorType.Solid,
          color: chartSettings.background,
        },
        textColor: "#9aa7b5",
        fontFamily: "var(--font-chart-mono), ui-monospace, monospace",
        // Hide lightweight-charts TradingView attribution logo (ChartDesk branding elsewhere).
        attributionLogo: false,
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
      timeScale: {
        borderColor: "#1e2a38",
        timeVisible: true,
        rightOffset: 14,
        shiftVisibleRangeOnNewBar: false,
        rightBarStaysOnScroll: false,
        fixRightEdge: false,
        fixLeftEdge: false,
        lockVisibleTimeRangeOnResize: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    // Leave room above volume for price; Stoch RSI uses a separate pane when enabled.
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.18 },
    });

    chartRef.current = chart;
    volumeRef.current = volumeSeries;
    rangeKeyRef.current = "";
    stochPaneEnsured.current = false;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w > 0 && h > 0) {
        chartRef.current.applyOptions({ width: w, height: h });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      setChartApi(null);
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeRef.current = null;
      stochPaneEnsured.current = false;
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

  // Feature ID: scale.log
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const mode =
      priceScaleMode === "log"
        ? PriceScaleMode.Logarithmic
        : PriceScaleMode.Normal;
    chart.priceScale("right").applyOptions({ mode });
  }, [priceScaleMode]);

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
    } else if (chartStyle === "baseline") {
      series = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: 0 },
        topLineColor: chartSettings.upColor,
        bottomLineColor: chartSettings.downColor,
        topFillColor1: "rgba(38,166,154,0.28)",
        topFillColor2: "rgba(38,166,154,0.05)",
        bottomFillColor1: "rgba(239,83,80,0.05)",
        bottomFillColor2: "rgba(239,83,80,0.28)",
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

  // Feature ID: chart.snapshot — chart + drawing overlay
  useEffect(() => {
    if (!snapshotTick || !chartRef.current) return;
    try {
      const shot = chartRef.current.takeScreenshot(true, false);
      const w = shot.width;
      const h = shot.height;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const ctx = off.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(shot, 0, 0);
      const drawEl = drawingCanvasRef.current;
      if (drawEl && drawEl.width > 0 && drawEl.height > 0) {
        ctx.drawImage(drawEl, 0, 0, w, h);
      }
      const url = off.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `chartdesk-${symbolId}-${Date.now()}.png`;
      a.click();
    } catch {
      /* ignore */
    }
  }, [snapshotTick, symbolId]);

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
    } else if (chartStyle === "baseline") {
      (main as ISeriesApi<"Baseline">).setData(
        displayCandles.map((c) => ({
          time: c.time as Time,
          value: c.close,
        }))
      );
    } else if (chartStyle === "hollow_candle") {
      (main as ISeriesApi<"Candlestick">).setData(
        displayCandles.map((c) => {
          const up = c.close >= c.open;
          return {
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            color: up ? "transparent" : chartSettings.downColor,
            borderColor: up ? chartSettings.upColor : chartSettings.downColor,
            wickColor: up ? chartSettings.upColor : chartSettings.downColor,
          };
        })
      );
    } else if (chartStyle === "volume_candles") {
      (main as ISeriesApi<"Candlestick">).setData(
        displayCandles.map((c, i) => {
          const up = c.close >= c.open;
          const w = volumeWeights[i] ?? 0.5;
          const alpha = 0.35 + w * 0.65;
          const upCol = `rgba(38,166,154,${alpha})`;
          const dnCol = `rgba(239,83,80,${alpha})`;
          return {
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            color: up ? upCol : dnCol,
            borderColor: up ? chartSettings.upColor : chartSettings.downColor,
            wickColor: up ? chartSettings.upColor : chartSettings.downColor,
          };
        })
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
    if (indicators.includes("ema20")) addLine(ema(closes, 20), "#22d3ee");
    if (indicators.includes("ema50")) addLine(ema(closes, 50), "#a78bfa");
    if (indicators.includes("ema200")) addLine(ema(closes, 200), "#f472b6");
    if (indicators.includes("wma")) addLine(wma(closes, 20), "#fcd34d");
    if (indicators.includes("ichimoku")) {
      const ichi = ichimoku(displayCandles);
      addLine(ichi.tenkan, "#ef4444");
      addLine(ichi.kijun, "#3b82f6");
      addLine(ichi.spanA, "#22c55e");
      addLine(ichi.spanB, "#eab308");
    }
    if (indicators.includes("supertrend")) {
      addLine(supertrend(displayCandles).line, "#14b8a6");
    }
    if (indicators.includes("bb")) {
      const bb = bollinger(displayCandles);
      addLine(bb.upper, "#64748b");
      addLine(bb.mid, "#94a3b8");
      addLine(bb.lower, "#64748b");
    }
    if (indicators.includes("vwap")) addLine(vwap(displayCandles), "#e8b86d");
    if (indicators.includes("rsi")) {
      const rsiVals = rsi(displayCandles, 14);
      addLine(rsiVals, "#c084fc", "rsi");
      if (
        indicatorOnIndicator?.parent === "rsi" &&
        indicatorOnIndicator.child === "sma20"
      ) {
        addLine(sma(rsiVals.map((v) => v ?? 0), 14), "#fbbf24", "rsi");
      }
    }
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
    if (indicators.includes("stoch")) {
      const st = stochastic(displayCandles);
      addLine(st.k, "#f97316", "stoch");
      addLine(st.d, "#6366f1", "stoch");
    }
    if (indicators.includes("stochRsi")) {
      // Dedicated subplot below price (TradingView-style), not price overlay.
      if (!stochPaneEnsured.current) {
        while (chart.panes().length < 2) {
          chart.addPane(true);
        }
        const panes = chart.panes();
        if (panes[0]) panes[0].setStretchFactor(3);
        if (panes[1]) panes[1].setStretchFactor(1);
        stochPaneEnsured.current = true;
      }
      const sr = stochasticRsi(displayCandles);
      const addStochLine = (values: (number | null)[], color: string) => {
        const series = chart.addSeries(
          LineSeries,
          {
            color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            title: color === "#22d3ee" ? "Stoch RSI K" : "Stoch RSI D",
          },
          1
        );
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
      addStochLine(sr.k, "#22d3ee");
      addStochLine(sr.d, "#f472b6");
      // Reference bands 20 / 80
      for (const level of [20, 80]) {
        const band = chart.addSeries(
          LineSeries,
          {
            color: "rgba(148,163,184,0.35)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          1
        );
        band.setData(
          displayCandles
            .filter((_, i) => sr.k[i] != null)
            .map((c) => ({ time: c.time as Time, value: level }))
        );
        overlayRefs.current.push(band);
      }
    } else if (stochPaneEnsured.current && chart.panes().length > 1) {
      try {
        chart.removePane(1);
      } catch {
        /* pane may already be gone */
      }
      stochPaneEnsured.current = false;
    }
    if (customIndicatorSource?.trim()) {
      const vals = runCustomIndicator(customIndicatorSource, displayCandles);
      addLine(vals, "#e879f9");
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

    if (
      chartStyle === "candle" ||
      chartStyle === "heikin_ashi" ||
      chartStyle === "bar" ||
      chartStyle === "hollow_candle" ||
      chartStyle === "volume_candles" ||
      chartStyle === "renko" ||
      chartStyle === "kagi" ||
      chartStyle === "line_break" ||
      chartStyle === "point_figure" ||
      chartStyle === "range" ||
      chartStyle === "volume_footprint" ||
      chartStyle === "tpo"
    ) {
      const markers: SeriesMarker<Time>[] = patternHits.map((h) => ({
        time: h.toTs as Time,
        position: "aboveBar",
        color: "#38bdf8",
        shape: "arrowDown",
        text: h.label,
      }));
      for (const ev of eventMarkers) {
        if (eventToggles && !eventToggles[ev.kind]) continue;
        markers.push({
          time: ev.time as Time,
          position: "belowBar",
          color:
            ev.kind === "earnings"
              ? "#a78bfa"
              : ev.kind === "dividends"
                ? "#34d399"
                : ev.kind === "splits"
                  ? "#fbbf24"
                  : "#60a5fa",
          shape: "circle",
          text: ev.title,
        });
      }
      if (extendedHours) {
        for (const c of displayCandles as SessionTaggedCandle[]) {
          const tag = c.sessionTag;
          if (tag === "pre" || tag === "post") {
            markers.push({
              time: c.time as Time,
              position: "belowBar",
              color: tag === "pre" ? "#94a3b8" : "#6366f1",
              shape: "square",
              text: tag === "pre" ? "Pre" : "Post",
            });
          }
        }
      }
      createSeriesMarkers(main as ISeriesApi<"Candlestick">, markers);
    }

    const barCount = barsForRangePreset(rangePreset, timeframe);
    const rangeKey = `${symbolId}|${timeframe}|${rangePreset}|${displayCandles.length > 0 ? displayCandles[0].time : 0}`;
    if (rangeKeyRef.current !== rangeKey) {
      rangeKeyRef.current = rangeKey;
      if (barCount == null) {
        chart.timeScale().fitContent();
      } else {
        const fromIdx = Math.max(0, displayCandles.length - barCount);
        const from = displayCandles[fromIdx]?.time;
        const to = displayCandles[displayCandles.length - 1]?.time;
        if (from != null && to != null) {
          chart.timeScale().setVisibleLogicalRange({
            from: fromIdx - 2,
            to: displayCandles.length - 1 + 14,
          });
        } else {
          chart.timeScale().fitContent();
        }
      }
      // Keep right breathing room after fit
      chart.timeScale().applyOptions({ rightOffset: 14 });
    }
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
    symbolId,
    displayCandles,
    indicators,
    patternHits,
    chartStyle,
    compareCandles,
    compareLabel,
    rangePreset,
    timeframe,
    eventMarkers,
    eventToggles,
    volumeWeights,
    indicatorOnIndicator,
    customIndicatorSource,
  ]);

  // Crosshair legend + layout.sync.crosshair
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param: {
      time?: Time;
      seriesData: Map<AnySeries, unknown>;
    }) => {
      if (!param.time) return;
      const t = Number(param.time);
      onCrosshairTime?.(t);
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
  }, [displayCandles, onCrosshairTime]);

  useEffect(() => {
    if (!syncCrosshair || sharedCrosshairTime == null) return;
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    if (!chart || !main) return;
    const c = displayCandles.find((x) => x.time === sharedCrosshairTime);
    if (!c) return;
    chart.setCrosshairPosition(c.close, sharedCrosshairTime as Time, main);
  }, [sharedCrosshairTime, syncCrosshair, displayCandles]);

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
      data-feature={
        chartStyle === "hollow_candle"
          ? "chart.type.hollow_candles"
          : chartStyle === "baseline"
            ? "chart.type.baseline"
            : chartStyle === "bar"
              ? "chart.type.bars"
              : chartStyle === "area"
                ? "chart.type.area"
                : chartStyle === "renko"
                  ? "chart.type.renko"
                  : chartStyle === "kagi"
                    ? "chart.type.kagi"
                    : chartStyle === "line_break"
                      ? "chart.type.line_break"
                      : chartStyle === "point_figure"
                        ? "chart.type.point_figure"
                        : chartStyle === "range"
                          ? "chart.type.range"
                          : chartStyle === "volume_candles"
                            ? "chart.type.volume_candles"
                            : chartStyle === "volume_footprint"
                              ? "chart.type.volume_footprint"
                              : chartStyle === "tpo"
                                ? "chart.type.tpo"
                                : undefined
      }
    >
      <div ref={containerRef} className="absolute inset-0" />
      <Phase4ChartOverlay chartStyle={chartStyle} candles={displayCandles} />
      {chartSettings.showWatermark && (
        <div
          className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center text-4xl font-semibold tracking-widest text-white/5"
          data-feature="chart.canvas"
        >
          {chartSettings.watermark}
        </div>
      )}
      {extendedHours && (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-[6] w-[14%] bg-slate-400/8"
            data-feature="chart.extended_hours"
            title="프리마켓 구간 (mock)"
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-[6] w-[14%] bg-indigo-500/8"
            data-feature="chart.extended_hours"
            title="애프터마켓 구간 (mock)"
          />
        </>
      )}
      {legend && (
        <div
          className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-[var(--workspace-muted)]"
          data-feature="chart.status_line"
        >
          <span className="mr-2 text-[var(--workspace-fg)]">
            {formatChartDate(legend.time, dateFormat, timezone)}
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
        stayInDrawMode={stayInDrawMode}
        candlesFull={candles}
        drawingCanvasRef={drawingCanvasRef as RefObject<HTMLCanvasElement | null>}
      />
      <PatternOverlay
        chartApi={chartApi}
        zones={easyZones}
        toggles={
          easyToggles ?? {
            ob: false,
            fvg: false,
            confluence: false,
            trend: false,
            channel: false,
            fakeout: false,
            srFlip: false,
            fib: false,
            overlapOnly: false,
            halfTpLabel: false,
            sma365: false,
          }
        }
      />
      {showCountdown && countdownSec > 0 && (
        <div
          className="pointer-events-none absolute bottom-2 right-2 z-20 rounded bg-black/55 px-2 py-1 font-mono text-[10px] text-[var(--workspace-muted)]"
          data-feature="scale.countdown"
        >
          봉 마감 {Math.floor(countdownSec / 60)}:
          {(countdownSec % 60).toString().padStart(2, "0")}
        </div>
      )}
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
