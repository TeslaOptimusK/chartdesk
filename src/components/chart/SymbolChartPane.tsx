"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartCanvas } from "@/components/chart/ChartCanvas";
import { useWorkspace, type IndicatorId } from "@/lib/store";
import type { Candle, Drawing, PatternHit } from "@/lib/types";
import { resampleCandles } from "@/lib/chart-time";
import { buildEventMarkers } from "@/lib/phase2-data";
import { cn } from "@/lib/utils";

interface SymbolChartPaneProps {
  symbolId: string;
  height?: number;
  className?: string;
  interactive?: boolean;
  paneIndex?: number;
}

export function SymbolChartPane({
  symbolId,
  height = 420,
  className,
  interactive = true,
  paneIndex = 0,
}: SymbolChartPaneProps) {
  const {
    timeframe,
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
    layoutMode,
  } = useWorkspace();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [compareCandles, setCompareCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const symbol = symbols.find((s) => s.id === symbolId);
  const compareSymbol = symbols.find((s) => s.id === compareSymbolId);

  const fetchTf = customIntervalMinutes ? "1" : timeframe;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/candles?symbolId=${symbolId}&tf=${fetchTf}&limit=240`)
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
  }, [symbolId, fetchTf]);

  useEffect(() => {
    if (!compareSymbolId || !interactive) {
      setCompareCandles([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/candles?symbolId=${compareSymbolId}&tf=${fetchTf}&limit=240`)
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
  }, [compareSymbolId, fetchTf, interactive]);

  const processedCandles = useMemo(() => {
    let list = candles;
    if (customIntervalMinutes && customIntervalMinutes > 0) {
      list = resampleCandles(list, customIntervalMinutes * 60);
    }
    if (replayActive && replayIndex != null && replayIndex >= 0) {
      list = list.slice(0, Math.min(replayIndex + 1, list.length));
    }
    return list;
  }, [candles, customIntervalMinutes, replayActive, replayIndex]);

  useEffect(() => {
    if (!replayActive || processedCandles.length === 0) return;
    if (replayIndex == null) setReplayIndex(processedCandles.length - 1);
  }, [replayActive, processedCandles.length, replayIndex, setReplayIndex]);

  useEffect(() => {
    if (!interactive || processedCandles.length === 0) return;
    const last = processedCandles[processedCandles.length - 1];
    const prev =
      processedCandles.length > 1
        ? processedCandles[processedCandles.length - 2]
        : null;
    const pending = priceWatches.filter(
      (w) => w.symbolId === symbolId && !w.triggered
    );
    if (!pending.length) return;

    const fired: string[] = [];
    for (const w of pending) {
      let hit = false;
      if (w.op === "above") hit = last.close >= w.price;
      else if (w.op === "below") hit = last.close <= w.price;
      else if (w.op === "crossing" && prev) {
        const before = prev.close;
        const after = last.close;
        hit =
          (before < w.price && after >= w.price) ||
          (before > w.price && after <= w.price);
      }
      if (hit) fired.push(w.id);
    }
    if (!fired.length) return;

    const nextWatches = priceWatches.map((w) =>
      fired.includes(w.id)
        ? { ...w, triggered: true, lastClose: last.close }
        : w
    );
    setPriceWatches(nextWatches);
    void fetch("/api/watches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceWatches: nextWatches }),
    });

    for (const w of pending.filter((x) => fired.includes(x.id))) {
      const opLabel =
        w.op === "above" ? "이상" : w.op === "below" ? "이하" : "돌파";
      void fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "price",
          title: `가격 알림 ${opLabel} ${w.price}`,
          message:
            w.message?.trim() ||
            `${symbol?.ticker ?? symbolId} 종가 ${last.close.toFixed(2)} (${opLabel} ${w.price})`,
          symbolId,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.alert) setAlerts([data.alert, ...alerts]);
        });
    }
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
        "relative flex min-h-0 flex-col bg-[var(--chart-bg)]",
        className
      )}
      data-pane-index={paneIndex}
      data-feature="layout.grid"
      data-layout-mode={layoutMode}
    >
      <div
        className="flex items-center justify-between border-b border-[var(--workspace-border)] px-3 py-1.5 text-xs text-[var(--workspace-muted)]"
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
        className="w-full"
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
          interactive && sync.crosshair && paneIndex === 0
            ? (t) => setSharedCrosshairTime(t)
            : undefined
        }
        stayInDrawMode={stayInDrawMode}
      />
    </div>
  );
}
