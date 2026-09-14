"use client";

import { useEffect, useState } from "react";
import { ChartCanvas } from "@/components/chart/ChartCanvas";
import { useWorkspace, type IndicatorId } from "@/lib/store";
import type { Candle, Drawing, PatternHit } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SymbolChartPaneProps {
  symbolId: string;
  height?: number;
  className?: string;
  interactive?: boolean;
}

export function SymbolChartPane({
  symbolId,
  height = 420,
  className,
  interactive = true,
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
  } = useWorkspace();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [compareCandles, setCompareCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const symbol = symbols.find((s) => s.id === symbolId);
  const compareSymbol = symbols.find((s) => s.id === compareSymbolId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/candles?symbolId=${symbolId}&tf=${timeframe}&limit=180`)
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
  }, [symbolId, timeframe]);

  useEffect(() => {
    if (!compareSymbolId || !interactive) {
      setCompareCandles([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/candles?symbolId=${compareSymbolId}&tf=${timeframe}&limit=180`)
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
  }, [compareSymbolId, timeframe, interactive]);

  // Fire price watches when last close crosses threshold
  useEffect(() => {
    if (!interactive || candles.length === 0) return;
    const last = candles[candles.length - 1];
    const pending = priceWatches.filter(
      (w) => w.symbolId === symbolId && !w.triggered
    );
    if (!pending.length) return;
    const fired: string[] = [];
    for (const w of pending) {
      const hit =
        (w.op === "above" && last.close >= w.price) ||
        (w.op === "below" && last.close <= w.price);
      if (hit) fired.push(w.id);
    }
    if (!fired.length) return;
    setPriceWatches(
      priceWatches.map((w) =>
        fired.includes(w.id) ? { ...w, triggered: true } : w
      )
    );
    for (const w of pending.filter((x) => fired.includes(x.id))) {
      void fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "price",
          title: `가격 알림 ${w.op === "above" ? "↑" : "↓"} ${w.price}`,
          message: `${symbol?.ticker ?? symbolId} 종가 ${last.close.toFixed(2)} (${w.op} ${w.price})`,
          symbolId,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.alert) setAlerts([data.alert, ...alerts]);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, symbolId]);

  const hits = patternHits.filter(
    (h: PatternHit) => h.symbolId === symbolId && h.timeframe === timeframe
  );
  const localDrawings = drawings.filter((d) => d.symbolId === symbolId);

  const persist = async (nextLocal: Drawing[]) => {
    const merged = [
      ...drawings.filter((d) => d.symbolId !== symbolId),
      ...nextLocal,
    ];
    setDrawings(merged);
    await fetch("/api/drawings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbolId, drawings: nextLocal }),
    });
  };

  const onAddDrawing = async (draft: Omit<Drawing, "id" | "createdAt">) => {
    if (!interactive) return;
    const next: Drawing = {
      ...draft,
      symbolId,
      id: `draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    await persist([...localDrawings, next]);
  };

  const onDeleteDrawing = async (id: string) => {
    if (!interactive) return;
    await persist(localDrawings.filter((d) => d.id !== id));
  };

  return (
    <div className={cn("relative flex min-h-0 flex-col bg-[var(--chart-bg)]", className)}>
      <div className="flex items-center justify-between border-b border-[var(--workspace-border)] px-3 py-1.5 text-xs text-[var(--workspace-muted)]">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold tracking-wide text-[var(--workspace-fg)]">
            {symbol?.ticker ?? symbolId}
          </span>
          <span>{symbol?.nameKo}</span>
          <span className="text-[var(--workspace-faint)]">{symbol?.exchange}</span>
        </div>
        <span>{timeframe === "D" ? "일봉" : `${timeframe}분`}</span>
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
      {!loading && !error && candles.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-[var(--workspace-muted)]">
          표시할 캔들이 없습니다
        </div>
      )}
      <ChartCanvas
        symbolId={symbolId}
        candles={candles}
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
      />
    </div>
  );
}
