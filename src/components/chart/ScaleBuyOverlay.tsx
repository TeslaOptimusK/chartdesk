"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartApiBundle } from "@/components/chart/DrawingOverlay";
import { useWorkspace } from "@/lib/store";

/** Drag a vertical price band for equal-split limit buys. */
export function ScaleBuyOverlay({
  chartApi,
  symbolId,
}: {
  chartApi: ChartApiBundle | null;
  symbolId: string;
}) {
  const picking = useWorkspace((s) => s.scaleBuyPicking);
  const band = useWorkspace((s) => s.scaleBuyBand);
  const activeSymbolId = useWorkspace((s) => s.activeSymbolId);
  const setPicking = useWorkspace((s) => s.setScaleBuyPicking);
  const setBand = useWorkspace((s) => s.setScaleBuyBand);
  const setBrokerOpen = useWorkspace((s) => s.setBrokerOpen);
  const anchor = useRef<number | null>(null);
  const [draft, setDraft] = useState<{ low: number; high: number } | null>(null);
  const [, setRev] = useState(0);

  const active = picking && symbolId === activeSymbolId;
  const shown =
    active && draft ? draft : band && band.symbolId === symbolId ? { low: band.low, high: band.high } : null;

  useEffect(() => {
    if (!chartApi) return;
    const bump = () => setRev((n) => n + 1);
    const scale = chartApi.chart.timeScale();
    scale.subscribeVisibleLogicalRangeChange(bump);
    chartApi.chart.subscribeCrosshairMove(bump);
    return () => {
      scale.unsubscribeVisibleLogicalRangeChange(bump);
      chartApi.chart.unsubscribeCrosshairMove(bump);
    };
  }, [chartApi]);

  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      anchor.current = null;
      setDraft(null);
      setPicking(false);
      setBrokerOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, setBrokerOpen, setPicking]);

  const yHigh =
    shown && chartApi ? chartApi.series.priceToCoordinate(Math.max(shown.low, shown.high)) : null;
  const yLow =
    shown && chartApi ? chartApi.series.priceToCoordinate(Math.min(shown.low, shown.high)) : null;

  function priceAt(clientY: number, el: HTMLElement): number | null {
    if (!chartApi) return null;
    const y = clientY - el.getBoundingClientRect().top;
    const price = chartApi.series.coordinateToPrice(y);
    return price == null || !Number.isFinite(price) ? null : price;
  }

  return (
    <div
      className={
        active
          ? "absolute inset-0 z-30 cursor-ns-resize"
          : "pointer-events-none absolute inset-0 z-30"
      }
      data-feature="trade.kiwoom.scale_band"
      onPointerDown={(ev) => {
        if (!active) return;
        const price = priceAt(ev.clientY, ev.currentTarget);
        if (price == null) return;
        anchor.current = price;
        ev.currentTarget.setPointerCapture(ev.pointerId);
        setDraft({ low: price, high: price });
      }}
      onPointerMove={(ev) => {
        if (!active || anchor.current == null) return;
        const price = priceAt(ev.clientY, ev.currentTarget);
        if (price == null) return;
        setDraft({ low: anchor.current, high: price });
      }}
      onPointerUp={(ev) => {
        if (!active) return;
        const start = anchor.current;
        const end = priceAt(ev.clientY, ev.currentTarget);
        anchor.current = null;
        setDraft(null);
        setPicking(false);
        if (start != null && end != null && Math.abs(end - start) > 0) {
          setBand({
            symbolId,
            low: Math.min(start, end),
            high: Math.max(start, end),
          });
        }
        setBrokerOpen(true);
      }}
    >
      {shown && yHigh != null && yLow != null && (
        <div
          className="absolute left-0 right-16 border-y border-amber-300/80 bg-amber-400/15"
          style={{
            top: Math.min(yHigh, yLow),
            height: Math.max(2, Math.abs(yLow - yHigh)),
          }}
        />
      )}
      {active && (
        <div className="pointer-events-none absolute left-2 top-10 rounded bg-black/70 px-2 py-1 text-[11px] text-amber-100">
          위아래로 드래그해 분할매수 구간을 지정하세요 · Esc 취소
        </div>
      )}
    </div>
  );
}
