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
  height,
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
  /** Only re-fit on symbol / timeframe / range-preset changes — never on live ticks. */
  const viewKeyRef = useRef<string>("");
  const followRealtimeRef = useRef(true);
  /**
   * After a viewKey change, re-fit until candle data fingerprint changes.
   * Covers the race where TF/symbol updates one frame before fresh bars arrive.
   */
  const pendingViewFitRef = useRef(false);
  const staleDataFpRef = useRef<string>("");
  const suppressRangeEventRef = useRef(false);
  const candleCountRef = useRef(0);
  const firstBarTimeRef = useRef<number | null>(null);
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

  // Parent clears bars on TF/symbol switch — forget the prior viewKey so the next
  // non-empty series always recenters (do not restore stale logical indices).
  useEffect(() => {
    if (displayCandles.length > 0) return;
    viewKeyRef.current = "";
    followRealtimeRef.current = true;
    pendingViewFitRef.current = false;
    staleDataFpRef.current = "";
    firstBarTimeRef.current = null;
    candleCountRef.current = 0;
  }, [displayCandles.length]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const chart = createChart(el, {
      width: el.clientWidth || undefined,
      // Prefer live container size so the chart fills the flex parent; fixed
      // height prop is only a fallback when the container has not laid out yet.
      height: el.clientHeight || height || Math.max(el.parentElement?.clientHeight ?? 0, 1),
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

    // Volume / oscillators live in dedicated panes (managed in the data effect).
    // Price pane keeps full vertical range — no bottom volume strip on candles.
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.05 },
    });

    chartRef.current = chart;
    volumeRef.current = null;
    viewKeyRef.current = "";
    followRealtimeRef.current = true;
    pendingViewFitRef.current = false;
    staleDataFpRef.current = "";
    firstBarTimeRef.current = null;
    candleCountRef.current = 0;
    stochPaneEnsured.current = false;

    const onVisibleRange = (
      range: { from: number; to: number } | null
    ) => {
      if (suppressRangeEventRef.current || !range) return;
      const n = candleCountRef.current;
      if (n <= 0) return;
      // Detached when the right edge is clearly left of the last bar
      // (user panned left — whitespace on the right must stick).
      followRealtimeRef.current = range.to >= n - 1 + 2;
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRange);

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w > 0 && h > 0) {
        // Size only — never fitContent / setVisibleRange on resize.
        chartRef.current.applyOptions({ width: w, height: h });
      }
    });
    ro.observe(el);
    if (wrapRef.current) ro.observe(wrapRef.current);
    // First layout pass may report 0×0 before flex settles — sync once after paint.
    requestAnimationFrame(() => {
      if (!containerRef.current || !chartRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w > 0 && h > 0) {
        chartRef.current.applyOptions({ width: w, height: h });
      }
    });

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRange);
      ro.disconnect();
      setChartApi(null);
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeRef.current = null;
      stochPaneEnsured.current = false;
    };
    // ResizeObserver owns size; do not recreate the chart when an optional
    // height prop changes — applyOptions on resize is enough.
    // chartSettings applied in separate effect after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      timeScale: {
        shiftVisibleRangeOnNewBar: false,
        rightBarStaysOnScroll: false,
        fixRightEdge: false,
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
    if (!chart || !main || displayCandles.length === 0) return;

    const prevLogical = chart.timeScale().getVisibleLogicalRange();
    const prevFirst = firstBarTimeRef.current;
    const prevCount = candleCountRef.current;
    const wasFollowing = followRealtimeRef.current;

    // Suppress range events while replacing series data so the library's
    // intermediate range cannot flip followRealtime and skip our restore.
    suppressRangeEventRef.current = true;

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

    for (const s of overlayRefs.current) {
      chart.removeSeries(s);
    }
    overlayRefs.current = [];
    if (volumeRef.current) {
      try {
        chart.removeSeries(volumeRef.current);
      } catch {
        /* already removed */
      }
      volumeRef.current = null;
    }

    const closes = displayCandles.map((c) => c.close);
    const addLine = (
      values: (number | null)[],
      color: string,
      opts?: {
        scaleId?: string;
        paneIndex?: number;
        title?: string;
        lastValueVisible?: boolean;
      }
    ) => {
      const series = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: opts?.lastValueVisible ?? false,
          priceScaleId: opts?.scaleId,
          title: opts?.title,
        },
        opts?.paneIndex ?? 0
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
      return series;
    };

    // Sub-panes below price: Volume, then oscillators (no overlap with candles).
    let nextPane = 1;
    const ensurePane = () => {
      const idx = nextPane++;
      while (chart.panes().length <= idx) {
        chart.addPane(true);
      }
      return idx;
    };

    const showVolume =
      indicators.includes("volume") || indicators.includes("volMa");
    let volumePane = 0;
    if (showVolume) {
      volumePane = ensurePane();
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
          title: "Volume",
        },
        volumePane
      );
      volumeSeries.setData(
        displayCandles.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color:
            c.close >= c.open
              ? "rgba(45,212,168,0.45)"
              : "rgba(240,113,120,0.45)",
        }))
      );
      volumeRef.current = volumeSeries;
      if (indicators.includes("volMa")) {
        const vols = displayCandles.map((c) => c.volume);
        const ma = sma(vols, 20);
        addLine(ma, "#a78bfa", {
          scaleId: "vol",
          paneIndex: volumePane,
          title: "VolMA",
        });
      }
    }

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
      const pane = ensurePane();
      const rsiVals = rsi(displayCandles, 14);
      addLine(rsiVals, "#c084fc", {
        scaleId: "rsi",
        paneIndex: pane,
        title: "RSI",
        lastValueVisible: true,
      });
      if (
        indicatorOnIndicator?.parent === "rsi" &&
        indicatorOnIndicator.child === "sma20"
      ) {
        addLine(
          sma(
            rsiVals.map((v) => v ?? 0),
            14
          ),
          "#fbbf24",
          { scaleId: "rsi", paneIndex: pane }
        );
      }
    }
    if (indicators.includes("atr")) {
      const pane = ensurePane();
      addLine(atr(displayCandles, 14), "#fb7185", {
        scaleId: "atr",
        paneIndex: pane,
        title: "ATR",
        lastValueVisible: true,
      });
    }
    if (indicators.includes("macd")) {
      const pane = ensurePane();
      const m = macd(displayCandles);
      const hist = chart.addSeries(
        HistogramSeries,
        {
          priceScaleId: "macd",
          priceLineVisible: false,
          lastValueVisible: false,
          title: "MACD",
        },
        pane
      );
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
      addLine(m.macd, "#38bdf8", { scaleId: "macd", paneIndex: pane });
      addLine(m.signal, "#fbbf24", { scaleId: "macd", paneIndex: pane });
    }
    if (indicators.includes("stoch")) {
      const pane = ensurePane();
      const st = stochastic(displayCandles);
      addLine(st.k, "#f97316", {
        scaleId: "stoch",
        paneIndex: pane,
        title: "Stoch K",
      });
      addLine(st.d, "#6366f1", {
        scaleId: "stoch",
        paneIndex: pane,
        title: "Stoch D",
      });
    }
    if (indicators.includes("stochRsi")) {
      const pane = ensurePane();
      stochPaneEnsured.current = true;
      const sr = stochasticRsi(displayCandles);
      addLine(sr.k, "#22d3ee", {
        paneIndex: pane,
        title: "Stoch RSI K",
        lastValueVisible: true,
      });
      addLine(sr.d, "#f472b6", {
        paneIndex: pane,
        title: "Stoch RSI D",
        lastValueVisible: true,
      });
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
          pane
        );
        band.setData(
          displayCandles
            .filter((_, i) => sr.k[i] != null)
            .map((c) => ({ time: c.time as Time, value: level }))
        );
        overlayRefs.current.push(band);
      }
    } else {
      stochPaneEnsured.current = false;
    }
    if (customIndicatorSource?.trim()) {
      const vals = runCustomIndicator(customIndicatorSource, displayCandles);
      addLine(vals, "#e879f9");
    }

    // Drop empty trailing panes; stretch price vs sub-panes.
    while (chart.panes().length > nextPane) {
      try {
        chart.removePane(chart.panes().length - 1);
      } catch {
        break;
      }
    }
    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(3);
    for (let i = 1; i < panes.length; i++) {
      panes[i]?.setStretchFactor(1);
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
    // Never include live candle timestamps / lengths — those change on every SSE tick
    // and previously re-triggered fitContent / setVisibleLogicalRange (pan snap-back).
    const viewKey = `${symbolId}|${timeframe}|${rangePreset}`;
    const newFirst = displayCandles[0]?.time ?? null;
    const newLast = displayCandles[displayCandles.length - 1]?.time ?? null;
    const newCount = displayCandles.length;
    const dataFp = `${newFirst}|${newLast}|${newCount}`;
    candleCountRef.current = newCount;

    const applyLogical = (from: number, to: number) => {
      try {
        chart.timeScale().setVisibleLogicalRange({ from, to });
      } catch {
        /* ignore invalid ranges during first paint */
      }
    };

    const recenterToLatest = () => {
      followRealtimeRef.current = true;
      // Blank chart after TF change is often a stuck Y-axis from the prior series.
      try {
        chart.priceScale("right").applyOptions({ autoScale: true });
      } catch {
        /* ignore */
      }
      if (barCount == null) {
        chart.timeScale().fitContent();
        chart.timeScale().applyOptions({ rightOffset: 14 });
      } else {
        const fromIdx = Math.max(0, displayCandles.length - barCount);
        applyLogical(fromIdx - 2, displayCandles.length - 1 + 14);
        chart.timeScale().applyOptions({ rightOffset: 14 });
      }
      try {
        chart.timeScale().scrollToRealTime();
      } catch {
        /* ignore */
      }
    };

    if (viewKeyRef.current !== viewKey) {
      // Symbol / timeframe / rangePreset changed — never restore prior logical range
      // (those indices belong to a different series and blank the canvas).
      viewKeyRef.current = viewKey;
      followRealtimeRef.current = true;
      pendingViewFitRef.current = true;
      staleDataFpRef.current = dataFp;
      recenterToLatest();
      // If bars were cleared before this paint, dataFp is already the new series —
      // one fit is enough. Otherwise keep pending until fingerprint changes.
      if (prevCount === 0 || prevFirst == null) {
        pendingViewFitRef.current = false;
      }
    } else if (pendingViewFitRef.current) {
      // TF/symbol updated before fresh candles arrived — re-fit, skip prevLogical.
      recenterToLatest();
      if (dataFp !== staleDataFpRef.current) {
        pendingViewFitRef.current = false;
      }
    } else if (!wasFollowing && prevLogical) {
      // Keep the user's pan. Compensate when the rolling window drops bars on the left.
      let leftShift = 0;
      if (prevFirst != null && newFirst != null && prevFirst !== newFirst) {
        const idx = displayCandles.findIndex((c) => c.time === prevFirst);
        leftShift = idx >= 0 ? idx : Math.max(0, newCount - prevCount);
      }
      applyLogical(prevLogical.from - leftShift, prevLogical.to - leftShift);
      followRealtimeRef.current = false;
    } else if (wasFollowing) {
      // Live ticks: keep Y autoScale so forming-bar wicks/body stay visible.
      try {
        chart.priceScale("right").applyOptions({ autoScale: true });
      } catch {
        /* ignore */
      }
    }
    // When wasFollowing and not pending a view fit, leave the time-scale range alone.

    firstBarTimeRef.current = newFirst;
    suppressRangeEventRef.current = false;

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

  // Go to date — only when the date string changes, not on every candle tick
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
    suppressRangeEventRef.current = true;
    followRealtimeRef.current = false;
    chart.timeScale().setVisibleRange({
      from: from as Time,
      to: to as Time,
    });
    suppressRangeEventRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: do not re-jump on candle ticks
  }, [goToDate]);

  useEffect(() => {
    if (drawingTool !== "none") setSelectedId(null);
  }, [drawingTool]);

  return (
    <div
      ref={wrapRef}
      className={cn("relative h-full min-h-0 w-full", className)}
      style={height != null ? { height } : undefined}
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
