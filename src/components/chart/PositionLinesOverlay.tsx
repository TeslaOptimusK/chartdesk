"use client";

import { useEffect, useRef, useState } from "react";
import type { ChartApiBundle } from "@/components/chart/DrawingOverlay";
import { toKiwoomCode } from "@/lib/kiwoom/quote-protocol";
import { roundToTick } from "@/lib/kiwoom/scale-plan";
import { useWorkspace } from "@/lib/store";

type LineKind = "entry" | "takeProfit" | "stopLoss";

interface Levels {
  entry: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  qty: number;
  code: string;
}

const COLOR: Record<LineKind, string> = {
  entry: "#fbbf24",
  takeProfit: "#34d399",
  stopLoss: "#fb7185",
};

const LABEL: Record<LineKind, string> = {
  entry: "체결",
  takeProfit: "목표",
  stopLoss: "손절",
};

function snap(price: number, kr: boolean): number {
  if (kr) return roundToTick(price);
  return Math.round(price * 100) / 100;
}

function keepLongSide(
  kind: LineKind,
  price: number,
  entry: number | null
): number {
  if (entry == null || kind === "entry") return price;
  if (kind === "takeProfit") return Math.max(price, entry);
  return Math.min(price, entry);
}

/**
 * Bybit-style fill, target, and stop lines. Dragging a line saves the bracket.
 */
export function PositionLinesOverlay({
  chartApi,
  symbolId,
}: {
  chartApi: ChartApiBundle | null;
  symbolId: string;
}) {
  const symbols = useWorkspace((s) => s.symbols);
  const setLines = useWorkspace((s) => s.setChartOrderLines);
  const symbol = symbols.find((s) => s.id === symbolId);
  const kr = symbol
    ? toKiwoomCode(symbol.ticker, symbol.exchange, symbol.assetClass) != null
    : false;
  const [levels, setLevels] = useState<Levels | null>(null);
  const [drag, setDrag] = useState<{ kind: LineKind; price: number } | null>(null);
  const dragRef = useRef(false);
  const committedAt = useRef(0);
  const levelsRef = useRef<Levels | null>(null);
  const [, setRev] = useState(0);
  levelsRef.current = levels;

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
    if (!symbol) return;
    let stop = false;
    const load = async () => {
      if (dragRef.current || Date.now() - committedAt.current < 4000) return;
      try {
        const res = await fetch("/api/kiwoom/account");
        if (!res.ok || stop) return;
        const data = (await res.json()) as {
          positions?: { code: string; qty: number; avgPrice: number | null }[];
          brackets?: {
            symbolId: string;
            code: string;
            qty: number;
            armed: boolean;
            entryPrice?: number | null;
            takeProfit: number | null;
            stopLoss: number | null;
          }[];
        };
        const ticker = symbol.ticker.toUpperCase();
        const code = toKiwoomCode(symbol.ticker, symbol.exchange, symbol.assetClass);
        const pos = (data.positions ?? []).find(
          (row) => row.code.toUpperCase() === ticker || (code != null && row.code === code)
        );
        const bracket = (data.brackets ?? []).find(
          (row) =>
            row.armed &&
            (row.symbolId === symbolId ||
              row.code.toUpperCase() === ticker ||
              (code != null && row.code === code))
        );
        if (!pos && !bracket) return;
        const entry = bracket?.entryPrice ?? pos?.avgPrice ?? null;
        if (entry == null || entry <= 0) return;
        const next: Levels = {
          entry,
          takeProfit: bracket?.takeProfit ?? entry * 1.03,
          stopLoss: bracket?.stopLoss ?? entry * 0.97,
          qty: pos?.qty || bracket?.qty || 1,
          code: pos?.code || bracket?.code || code || ticker,
        };
        setLevels(next);
        setLines({
          symbolId,
          entry: next.entry,
          takeProfit: next.takeProfit,
          stopLoss: next.stopLoss,
        });
      } catch {
        /* account unread */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 8000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [symbol, symbolId, setLines]);

  const shown = levels
    ? {
        entry: drag?.kind === "entry" ? drag.price : levels.entry,
        takeProfit: drag?.kind === "takeProfit" ? drag.price : levels.takeProfit,
        stopLoss: drag?.kind === "stopLoss" ? drag.price : levels.stopLoss,
      }
    : null;

  function priceAt(clientY: number, el: HTMLElement): number | null {
    if (!chartApi) return null;
    const y = clientY - el.getBoundingClientRect().top;
    const price = chartApi.series.coordinateToPrice(y);
    return price == null || !Number.isFinite(price) ? null : price;
  }

  async function commit(next: Levels) {
    committedAt.current = Date.now();
    setLevels(next);
    setLines({
      symbolId,
      entry: next.entry,
      takeProfit: next.takeProfit,
      stopLoss: next.stopLoss,
    });
    if (!next.code || next.entry == null) return;
    await fetch("/api/kiwoom/brackets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbolId,
        code: next.code,
        qty: next.qty,
        entryPrice: next.entry,
        takeProfit: next.takeProfit,
        stopLoss: next.stopLoss,
      }),
    }).catch(() => undefined);
  }

  if (!chartApi || !shown) return null;

  const rows: { kind: LineKind; price: number | null }[] = [
    { kind: "entry", price: shown.entry },
    { kind: "takeProfit", price: shown.takeProfit },
    { kind: "stopLoss", price: shown.stopLoss },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-feature="trade.chart.lines">
      {rows.map((row) => {
        if (row.price == null) return null;
        const y = chartApi.series.priceToCoordinate(row.price);
        if (y == null) return null;
        const text = kr ? Math.round(row.price).toLocaleString("ko-KR") : row.price.toFixed(2);
        return (
          <div
            key={row.kind}
            className="pointer-events-auto absolute left-0 right-0 h-4 -translate-y-1/2 cursor-ns-resize"
            style={{ top: y }}
            onPointerDown={(ev) => {
              dragRef.current = true;
              ev.currentTarget.setPointerCapture(ev.pointerId);
              ev.stopPropagation();
              setDrag({ kind: row.kind, price: row.price! });
            }}
            onPointerMove={(ev) => {
              if (!dragRef.current) return;
              const price = priceAt(ev.clientY, ev.currentTarget.parentElement ?? ev.currentTarget);
              if (price == null) return;
              const entry = levelsRef.current?.entry ?? null;
              setDrag({
                kind: row.kind,
                price: keepLongSide(row.kind, price, row.kind === "entry" ? null : entry),
              });
            }}
            onPointerUp={(ev) => {
              const price = priceAt(ev.clientY, ev.currentTarget.parentElement ?? ev.currentTarget);
              dragRef.current = false;
              setDrag(null);
              const base = levelsRef.current;
              if (!base || price == null) return;
              const entryNow = row.kind === "entry" ? price : base.entry;
              const moved = snap(
                keepLongSide(row.kind, price, row.kind === "entry" ? null : entryNow),
                kr
              );
              const next: Levels = {
                ...base,
                entry: row.kind === "entry" ? moved : base.entry,
                takeProfit:
                  row.kind === "takeProfit"
                    ? moved
                    : base.takeProfit != null && entryNow != null && base.takeProfit <= entryNow
                      ? snap(entryNow * 1.03, kr)
                      : base.takeProfit,
                stopLoss:
                  row.kind === "stopLoss"
                    ? moved
                    : base.stopLoss != null && entryNow != null && base.stopLoss >= entryNow
                      ? snap(entryNow * 0.97, kr)
                      : base.stopLoss,
              };
              if (row.kind === "entry" && next.entry != null) {
                if (next.takeProfit != null && next.takeProfit <= next.entry) {
                  next.takeProfit = snap(next.entry * 1.03, kr);
                }
                if (next.stopLoss != null && next.stopLoss >= next.entry) {
                  next.stopLoss = snap(next.entry * 0.97, kr);
                }
              }
              void commit(next);
            }}
          >
            <div
              className="absolute left-0 right-16 top-1/2 border-t"
              style={{ borderColor: COLOR[row.kind] }}
            />
            <div
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[10px] text-black"
              style={{ background: COLOR[row.kind] }}
            >
              {LABEL[row.kind]} {text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
