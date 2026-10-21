"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChartCanvas } from "@/components/chart/ChartCanvas";
import { useWorkspace, type IndicatorId } from "@/lib/store";
import type { Candle, Drawing, PatternHit, Timeframe } from "@/lib/types";
import { resampleCandles, timeframeSeconds } from "@/lib/chart-time";
import { appendExtendedSessionBars } from "@/lib/extended-hours";
import { buildEventMarkers } from "@/lib/phase2-data";
import {
  detectEasyOverlayZones,
  zonesInsideCandleRange,
  SCALP_STRUCTURE_TF,
  SWING_STRUCTURE_TF,
  type EasyZone,
} from "@/lib/easychart";
import {
  collapseEntrySignalsForDisplay,
  detectEntrySignals,
} from "@/lib/entry-signals";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { retainChartQuote, useQuotesStore } from "@/lib/quotes-store";
import { ExchangeMark } from "@/components/market/ExchangeMark";
import { LiveQuoteBadge } from "@/components/market/LiveQuoteBadge";
import { alignSeedDrawings } from "@/lib/seed";
import { applyLiveCandle } from "@/lib/market-data/mock-adapter";

interface LoadedSeries {
  key: string;
  candles: Candle[];
  /** Generated sample bars, shown when the feed had nothing for this symbol. */
  synthetic: boolean;
}

const NO_CANDLES: Candle[] = [];

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
    activeSymbolId,
    entrySignalsEnabled,
  } = useWorkspace();
  const timeframe = paneTimeframe ?? storeTimeframe;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [marketMode, setMarketMode] = useState<"mock" | "delayed" | "realtime">(
    "mock"
  );
  const liveMaxJumpRef = useRef<number | undefined>(undefined);
  const pendingTickRef = useRef<Candle | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const setFromCandles = useQuotesStore((s) => s.setFromCandles);
  const setFromTick = useQuotesStore((s) => s.setFromTick);
  const symbol = symbols.find((s) => s.id === symbolId);
  const compareSymbol = symbols.find((s) => s.id === compareSymbolId);

  const fetchTf = customIntervalMinutes ? "1" : timeframe;
  const candleLimit = fetchTf === "tick" ? 480 : 240;
  const structureTf: Timeframe =
    easyOverlayPreset === "swing" ? SWING_STRUCTURE_TF : SCALP_STRUCTURE_TF;

  // Bars carry the key they were loaded for. A symbol/TF switch shows nothing
  // until the new series lands, so ChartCanvas never fits the previous series
  // under the new viewKey, and a late tick from the old stream is dropped.
  const candleSourceKey = `${symbolId}|${fetchTf}|${candleLimit}`;
  const [series, setSeries] = useState<LoadedSeries>({
    key: candleSourceKey,
    candles: NO_CANDLES,
    synthetic: false,
  });
  if (series.key !== candleSourceKey) {
    setSeries({ key: candleSourceKey, candles: NO_CANDLES, synthetic: false });
    setLoading(true);
    setError(null);
  }
  const candles = series.key === candleSourceKey ? series.candles : NO_CANDLES;

  useEffect(() => {
    let cancelled = false;
    const requestKey = candleSourceKey;
    fetch(`/api/candles?symbolId=${symbolId}&tf=${fetchTf}&limit=${candleLimit}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("시세 로드 실패");
        return r.json();
      })
      .then((data: { candles: Candle[]; synthetic?: boolean }) => {
        if (cancelled) return;
        setSeries((prev) =>
          prev.key === requestKey
            ? { key: requestKey, candles: data.candles, synthetic: data.synthetic === true }
            : prev
        );
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbolId, fetchTf, candleLimit, candleSourceKey, attempt]);

  const retryLoad = () => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market/stream-info")
      .then((r) => r.json())
      .then((d: { mode?: "mock" | "delayed" | "realtime"; kiwoom?: boolean }) => {
        if (cancelled) return;
        if (d.mode) setMarketMode(d.mode);
        liveMaxJumpRef.current = d.kiwoom ? 0.35 : undefined;
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
        const next = msg.candle;
        setFromTick(symbolId, next);
        pendingTickRef.current = next;
        if (tickTimerRef.current != null) return;
        tickTimerRef.current = window.setTimeout(() => {
          tickTimerRef.current = null;
          const candle = pendingTickRef.current;
          pendingTickRef.current = null;
          if (!candle) return;
          const expectedKey = `${symbolId}|${streamTf}|${candleLimit}`;
          setSeries((prev) => {
            // Drop updates from a prior TF/symbol EventSource whose setState
            // landed after the series was replaced (causes asc-order crashes).
            if (prev.key !== expectedKey) return prev;
            // Wait for the HTTP series for this TF — avoid seeding with a lone
            // 1m SSE bar while Tick synthetic bars are still loading.
            if (!prev.candles.length) return prev;
            const merged = applyLiveCandle(prev.candles, candle, {
              streamTf,
              maxJump: liveMaxJumpRef.current,
            });
            if (merged === prev.candles) return prev;
            return {
              ...prev,
              candles: merged.length > candleLimit ? merged.slice(-candleLimit) : merged,
            };
          });
        }, 120);
      } catch {
        /* ignore */
      }
    };
    return () => {
      cancelled = true;
      if (tickTimerRef.current != null) {
        window.clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      es.close();
    };
  }, [interactive, marketMode, symbolId, fetchTf, candleLimit, setFromTick]);

  const compareKey =
    compareSymbolId && interactive ? `${compareSymbolId}|${fetchTf}|${candleLimit}` : null;
  const [compareSeries, setCompareSeries] = useState<{ key: string; candles: Candle[] } | null>(
    null
  );
  const compareCandles =
    compareKey != null && compareSeries?.key === compareKey ? compareSeries.candles : NO_CANDLES;

  useEffect(() => {
    if (!compareKey || !compareSymbolId) return;
    let cancelled = false;
    fetch(`/api/candles?symbolId=${compareSymbolId}&tf=${fetchTf}&limit=${candleLimit}`)
      .then((r) => r.json())
      .then((data: { candles?: Candle[] }) => {
        if (!cancelled) setCompareSeries({ key: compareKey, candles: data.candles ?? NO_CANDLES });
      })
      .catch(() => {
        if (!cancelled) setCompareSeries({ key: compareKey, candles: NO_CANDLES });
      });
    return () => {
      cancelled = true;
    };
  }, [compareKey, compareSymbolId, fetchTf, candleLimit]);

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

  useEffect(() => retainChartQuote(symbolId), [symbolId]);

  // Header + watchlist read this pane's displayed series for symbols on screen.
  useEffect(() => {
    if (!processedCandles.length) return;
    if (symbolId === activeSymbolId && !active) return;
    setFromCandles(symbolId, processedCandles);
  }, [
    processedCandles,
    symbolId,
    activeSymbolId,
    active,
    setFromCandles,
  ]);

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
  const localDrawings = useMemo(
    () =>
      alignSeedDrawings(
        drawings.filter((d) => d.symbolId === symbolId),
        symbolId,
        processedCandles
      ),
    [drawings, symbolId, processedCandles]
  );
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
    return zonesInsideCandleRange(
      detectEasyOverlayZones(
        processedCandles,
        structureCandles.length >= 10 ? structureCandles : null,
        { confluenceThreshold: easyOverlayToggles.confluence ? 2 : 1 },
        easyOverlayToggles
      ),
      processedCandles
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

  const entrySignals = useMemo(() => {
    if (!entrySignalsEnabled || !interactive) return [];
    return collapseEntrySignalsForDisplay(
      detectEntrySignals(processedCandles),
      { lastBarIndex: processedCandles.length - 1 }
    );
  }, [entrySignalsEnabled, interactive, processedCandles]);

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
        className="flex h-11 shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-[var(--workspace-border)] px-3 text-sm text-[var(--workspace-muted)]"
        data-feature="symbol.header"
      >
        <div className="flex min-w-0 flex-nowrap items-baseline gap-2 overflow-hidden">
          {symbol?.exchange && <ExchangeMark exchange={symbol.exchange} />}
          <span className="font-semibold tracking-wide text-[var(--workspace-fg)]">
            {symbol?.ticker ?? symbolId}
          </span>
          <span className="min-w-0 truncate">{symbol?.nameKo}</span>
          <span className="text-[var(--workspace-faint)]">{symbol?.exchange}</span>
          <LiveQuoteBadge symbolId={symbolId} assetClass={symbol?.assetClass} />
          {series.synthetic && !loading && (
            <button
              type="button"
              className="shrink-0 rounded border border-amber-400/50 bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/25"
              title={
                marketMode === "mock"
                  ? "MARKET_DATA_MODE=mock 이라 임의로 만든 캔들을 표시합니다."
                  : "실시세를 받지 못해 임의로 만든 캔들을 표시합니다. 실제 가격이 아닙니다. 누르면 다시 불러옵니다."
              }
              onClick={(ev) => {
                ev.stopPropagation();
                retryLoad();
              }}
              data-feature="data.synthetic"
            >
              {marketMode === "mock" ? "모의 시세" : "샘플 데이터 · 다시 불러오기"}
            </button>
          )}
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
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-sm text-rose-300">
          {error}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={(ev) => {
              ev.stopPropagation();
              retryLoad();
            }}
          >
            다시 시도
          </Button>
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
          pricePrecision={/^\d{6}$/.test(symbol?.ticker ?? "") ? 0 : 2}
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
          entrySignals={entrySignals}
          entrySignalsEnabled={entrySignalsEnabled}
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
