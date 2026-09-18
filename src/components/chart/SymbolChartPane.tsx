"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartCanvas } from "@/components/chart/ChartCanvas";
import { useWorkspace, type IndicatorId } from "@/lib/store";
import type { Candle, Drawing, PatternHit, Timeframe } from "@/lib/types";
import { resampleCandles, timeframeSeconds } from "@/lib/chart-time";
import { appendExtendedSessionBars } from "@/lib/extended-hours";
import { buildEventMarkers } from "@/lib/phase2-data";
import {
  detectEasyOverlayZones,
  SCALP_STRUCTURE_TF,
  SWING_STRUCTURE_TF,
  type EasyZone,
} from "@/lib/easychart";
import { cn } from "@/lib/utils";

interface SymbolChartPaneProps {
  symbolId: string;
  height?: number;
  className?: string;
  interactive?: boolean;
  paneIndex?: number;
  /** Override store timeframe for this pane (multi-chart). */
  paneTimeframe?: Timeframe;
  active?: boolean;
  onActivate?: () => void;
}

export function SymbolChartPane({
  symbolId,
  height,
  className,
  interactive = true,
  paneIndex = 0,
  paneTimeframe,
  active = false,
  onActivate,
}: SymbolChartPaneProps) {
  const {
    timeframe: storeTimeframe,
    indicators,
    drawingTool,
    patternHits,
    drawings,
    setDrawings,
    symbols,
    chartStyle,
    compareSymbolId,
    magnet,
    goToDate,
    priceWatches,
    setPriceWatches,
    setAlerts,
    alerts,
    setTechnicalAlerts,
    setMultiConditionAlerts,
    drawingsLocked,
    chartSettings,
    priceScaleMode,
    rangePreset,
    dateFormat,
    extendedHours,
    showCountdown,
    timezone,
    eventToggles,
    snapshotTick,
    sync,
    sharedCrosshairTime,
    setSharedCrosshairTime,
    stayInDrawMode,
    customIntervalMinutes,
    replayActive,
    replayIndex,
    setReplayIndex,
    setReplayTotalBars,
    layoutMode,
    indicatorOnIndicator,
    customIndicatorSource,
    easyOverlayEnabled,
    easyOverlayToggles,
    easyOverlayPreset,
  } = useWorkspace();
  const timeframe = paneTimeframe ?? storeTimeframe;
  const [candles, setCandles] = useState<Candle[]>([]);
  const [compareCandles, setCompareCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketMode, setMarketMode] = useState<"mock" | "delayed" | "realtime">(
    "mock"
  );
  const symbol = symbols.find((s) => s.id === symbolId);
  const compareSymbol = symbols.find((s) => s.id === compareSymbolId);

  const fetchTf = customIntervalMinutes ? "1" : timeframe;
  const candleLimit = fetchTf === "tick" ? 480 : 240;
  const structureTf: Timeframe =
    easyOverlayPreset === "swing" ? SWING_STRUCTURE_TF : SCALP_STRUCTURE_TF;

  // Drop stale bars as soon as symbol/TF changes so ChartCanvas does not fit the
  // previous series under the new viewKey (blank / wrong price scale).
  const candleSourceKey = `${symbolId}|${fetchTf}|${candleLimit}`;
  const [activeCandleKey, setActiveCandleKey] = useState(candleSourceKey);
  if (candleSourceKey !== activeCandleKey) {
    setActiveCandleKey(candleSourceKey);
    setCandles([]);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/candles?symbolId=${symbolId}&tf=${fetchTf}&limit=${candleLimit}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("시세 로드 실패");
        return r.json();
      })
      .then((data: { candles: Candle[] }) => {
        if (!cancelled) {
          setCandles(data.candles);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [symbolId, fetchTf, candleLimit]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/stream-info")
      .then((r) => r.json())
      .then((d: { mode?: "mock" | "delayed" | "realtime" }) => {
        if (!cancelled && d.mode) setMarketMode(d.mode);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Mock / delayed / realtime — SSE ticks drive candle updates + alert evaluate
  useEffect(() => {
    if (!interactive) return;
    let cancelled = false;
    const streamTf = fetchTf;
    const es = new EventSource(
      `/api/market/sse?symbolId=${encodeURIComponent(symbolId)}&tf=${encodeURIComponent(streamTf)}`
    );
    es.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(ev.data) as { type?: string; candle?: Candle };
        if (msg.type !== "candle" || !msg.candle) return;
        setCandles((prev) => {
          const next = msg.candle!;
          if (!prev.length) {
            // Wait for the HTTP series for this TF — avoid seeding with a lone
            // 1m SSE bar while Tick synthetic bars are still loading.
            return prev;
          }
          const last = prev[prev.length - 1];
          // Stale stream from a prior TF (or 1m SSE onto Tick) can send an older
          // timestamp and crash lightweight-charts ("data must be asc ordered").
          if (next.time < last.time) {
            if (streamTf === "tick") {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  close: next.close,
                  high: Math.max(last.high, next.high, next.close),
                  low: Math.min(last.low, next.low, next.close),
                  volume: last.volume,
                },
              ];
            }
            return prev;
          }
          if (last.time === next.time) {
            return [...prev.slice(0, -1), next];
          }
          // Tick series uses synthetic sub-minute bars; a new 1m SSE bar should
          // update the last tick rather than append a coarse bar mid-series.
          if (streamTf === "tick") {
            return [
              ...prev.slice(0, -1),
              {
                time: last.time,
                open: last.open,
                close: next.close,
                high: Math.max(last.high, next.high, next.close),
                low: Math.min(last.low, next.low, next.close),
                volume: last.volume + Math.max(1, Math.floor(next.volume / 20)),
              },
            ];
          }
          return [...prev.slice(-(candleLimit - 1)), next];
        });
      } catch {
        /* ignore */
      }
    };
    return () => {
      cancelled = true;
      es.close();
    };
  }, [interactive, marketMode, symbolId, fetchTf, candleLimit]);

  useEffect(() => {
    if (!compareSymbolId || !interactive) {
      setCompareCandles([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/candles?symbolId=${compareSymbolId}&tf=${fetchTf}&limit=${candleLimit}`)
      .then((r) => r.json())
      .then((data: { candles: Candle[] }) => {
        if (!cancelled) setCompareCandles(data.candles ?? []);
      })
      .catch(() => {
        if (!cancelled) setCompareCandles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [compareSymbolId, fetchTf, candleLimit, interactive]);

  const baseCandles = useMemo(() => {
    let list = candles;
    if (extendedHours && list.length) {
      list = appendExtendedSessionBars(
        list,
        customIntervalMinutes ? "5" : timeframe
      );
    }
    if (customIntervalMinutes && customIntervalMinutes > 0) {
      list = resampleCandles(list, customIntervalMinutes * 60);
    }
    return list;
  }, [candles, extendedHours, customIntervalMinutes, timeframe]);

  const processedCandles = useMemo(() => {
    let list = baseCandles;
    if (replayActive && replayIndex != null && replayIndex >= 0) {
      list = list.slice(0, Math.min(replayIndex + 1, list.length));
    }
    return list;
  }, [baseCandles, replayActive, replayIndex]);

  useEffect(() => {
    if (interactive) setReplayTotalBars(Math.max(baseCandles.length, 10));
  }, [baseCandles.length, interactive, setReplayTotalBars]);

  useEffect(() => {
    if (!replayActive || baseCandles.length === 0) return;
    if (replayIndex == null) setReplayIndex(0);
  }, [replayActive, baseCandles.length, replayIndex, setReplayIndex]);

  useEffect(() => {
    if (!replayActive || !interactive || baseCandles.length === 0) return;
    const id = window.setInterval(() => {
      const cur = replayIndex ?? 0;
      if (cur >= baseCandles.length - 1) return;
      setReplayIndex(cur + 1);
    }, 450);
    return () => window.clearInterval(id);
  }, [
    replayActive,
    interactive,
    baseCandles.length,
    replayIndex,
    setReplayIndex,
  ]);

  useEffect(() => {
    if (!interactive || processedCandles.length === 0) return;
    const last = processedCandles[processedCandles.length - 1];
    void fetch("/api/alerts/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbolId,
        candles: processedCandles,
        lastClose: last.close,
        tf: fetchTf,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.priceWatches) setPriceWatches(data.priceWatches);
        if (data.technicalAlerts) setTechnicalAlerts(data.technicalAlerts);
        if (data.multiConditionAlerts) {
          setMultiConditionAlerts(data.multiConditionAlerts);
        }
        if (data.fired?.length) {
          setAlerts(data.alerts ?? [...data.fired, ...alerts]);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedCandles, symbolId]);

  const hits = patternHits.filter(
    (h: PatternHit) => h.symbolId === symbolId && h.timeframe === timeframe
  );
  const localDrawings = drawings.filter((d) => d.symbolId === symbolId);
  const eventMarkers = useMemo(
    () => buildEventMarkers(symbolId),
    [symbolId]
  );

  const easyZones: EasyZone[] = useMemo(() => {
    if (!easyOverlayEnabled || !interactive) return [];
    const ltfSec = timeframeSeconds(
      (customIntervalMinutes ? "5" : timeframe) as Timeframe
    );
    const htfSec = timeframeSeconds(structureTf);
    const structureCandles =
      htfSec > ltfSec
        ? resampleCandles(processedCandles, htfSec)
        : processedCandles;
    return detectEasyOverlayZones(
      processedCandles,
      structureCandles.length >= 10 ? structureCandles : null,
      { confluenceThreshold: easyOverlayToggles.confluence ? 2 : 1 },
      easyOverlayToggles
    );
  }, [
    easyOverlayEnabled,
    interactive,
    processedCandles,
    structureTf,
    timeframe,
    customIntervalMinutes,
    easyOverlayToggles,
  ]);

  const persist = async (nextLocal: Drawing[]) => {
    const merged = sync.drawings
      ? [
          ...drawings.filter((d) => d.symbolId !== symbolId),
          ...nextLocal,
        ]
      : [
          ...drawings.filter((d) => d.symbolId !== symbolId),
          ...nextLocal,
        ];
    setDrawings(merged, !sync.drawings);
    await fetch("/api/drawings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbolId, drawings: nextLocal }),
    });
  };

  const onAddDrawing = async (draft: Omit<Drawing, "id" | "createdAt">) => {
    if (!interactive || drawingsLocked) return;
    const next: Drawing = {
      ...draft,
      symbolId,
      id: `draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    await persist([...localDrawings, next]);
  };

  const onDeleteDrawing = async (id: string) => {
    if (!interactive || drawingsLocked) return;
    await persist(localDrawings.filter((d) => d.id !== id));
  };

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col bg-[var(--chart-bg)]",
        active && "ring-1 ring-inset ring-[var(--brand-accent)]/70",
        className
      )}
      data-pane-index={paneIndex}
      data-pane-active={active ? "1" : "0"}
      data-feature="layout.grid"
      data-layout-mode={layoutMode}
      onMouseDown={() => onActivate?.()}
    >
      <div
        className="flex shrink-0 items-center justify-between border-b border-[var(--workspace-border)] px-3 py-1.5 text-xs text-[var(--workspace-muted)]"
        data-feature="symbol.header"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-semibold tracking-wide text-[var(--workspace-fg)]">
            {symbol?.ticker ?? symbolId}
          </span>
          <span>{symbol?.nameKo}</span>
          <span className="text-[var(--workspace-faint)]">{symbol?.exchange}</span>
        </div>
        <span>
          {customIntervalMinutes
            ? `${customIntervalMinutes}분`
            : timeframe === "D"
              ? "일봉"
              : `${timeframe}분`}
          {replayActive ? " · 리플레이" : ""}
        </span>
      </div>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--chart-bg)]/80 text-sm text-[var(--workspace-muted)]">
          차트 로딩…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-rose-300">
          {error}
        </div>
      )}
      {!loading && !error && processedCandles.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-[var(--workspace-muted)]">
          표시할 캔들이 없습니다
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <ChartCanvas
          symbolId={symbolId}
          candles={processedCandles}
          indicators={indicators as IndicatorId[]}
          patternHits={hits}
          drawings={localDrawings}
          drawingTool={interactive ? drawingTool : "none"}
          onAddDrawing={interactive ? onAddDrawing : undefined}
          onDeleteDrawing={interactive ? onDeleteDrawing : undefined}
          chartStyle={chartStyle}
          compareCandles={interactive ? compareCandles : undefined}
          compareLabel={compareSymbol?.ticker}
          magnet={magnet}
          goToDate={interactive ? goToDate : null}
          height={height}
          className="absolute inset-0 h-full w-full"
          chartSettings={chartSettings}
          locked={drawingsLocked}
          priceScaleMode={priceScaleMode}
          rangePreset={rangePreset}
          dateFormat={dateFormat}
          extendedHours={extendedHours}
          showCountdown={showCountdown}
          timeframe={customIntervalMinutes ? "5" : timeframe}
          timezone={timezone}
          eventMarkers={eventMarkers}
          eventToggles={eventToggles}
          snapshotTick={interactive ? snapshotTick : 0}
          syncCrosshair={sync.crosshair}
          sharedCrosshairTime={sharedCrosshairTime}
          onCrosshairTime={
            interactive && sync.crosshair
              ? (t) => setSharedCrosshairTime(t)
              : undefined
          }
          stayInDrawMode={stayInDrawMode}
          indicatorOnIndicator={indicatorOnIndicator}
          customIndicatorSource={customIndicatorSource}
          easyZones={easyZones}
          easyToggles={
            easyOverlayEnabled
              ? easyOverlayToggles
              : {
                  ...easyOverlayToggles,
                  ob: false,
                  fvg: false,
                  trend: false,
                  channel: false,
                  fakeout: false,
                  srFlip: false,
                  fib: false,
                  sma365: false,
                }
          }
          easyOverlayOn={easyOverlayEnabled}
        />
      </div>
    </div>
  );
}
