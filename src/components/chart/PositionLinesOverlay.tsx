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
  /** Set when the server is watching that level. Otherwise the line is only a suggestion. */
  armedTake: boolean;
  armedStop: boolean;
  live: boolean;
}

interface AccountLines {
  live?: boolean;
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

/** Below this many pixels a press on a line is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;
const POLL_MS = 8000;

let sharedAccount: { at: number; promise: Promise<AccountLines | null> } | null = null;

/** Every chart pane draws these lines; they share one account read per poll. */
function readAccountLines(): Promise<AccountLines | null> {
  const now = Date.now();
  if (sharedAccount && now - sharedAccount.at < POLL_MS - 1000) return sharedAccount.promise;
  const promise = fetch("/api/kiwoom/account")
    .then(async (res) => (res.ok ? ((await res.json()) as AccountLines) : null))
    .catch(() => null);
  sharedAccount = { at: now, promise };
  return promise;
}

const heldUntil = new Map<string, number>();

/** After a drop, keep the dropped lines until the server has the new bracket. */
function holdLines(symbolId: string): void {
  heldUntil.set(symbolId, Date.now() + 4000);
  sharedAccount = null;
}

function linesHeld(symbolId: string): boolean {
  return Date.now() < (heldUntil.get(symbolId) ?? 0);
}

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

function formatPrice(price: number, kr: boolean): string {
  return kr ? Math.round(price).toLocaleString("ko-KR") : price.toFixed(2);
}

/**
 * Bybit-style fill, target, and stop lines. Dragging a line on a domestic
 * holding saves the bracket; solid lines are watched, dashed ones are not.
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
  const dragRef = useRef<{ startY: number } | null>(null);
  const [, setRev] = useState(0);

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
      if (dragRef.current || linesHeld(symbolId)) return;
      const data = await readAccountLines();
      if (!data || stop) return;
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
        armedTake: bracket?.takeProfit != null,
        armedStop: bracket?.stopLoss != null,
        live: data.live === true,
      };
      setLevels(next);
      setLines({
        symbolId,
        entry: next.entry,
        takeProfit: next.takeProfit,
        stopLoss: next.stopLoss,
      });
    };
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [symbol, symbolId, setLines]);

  if (!chartApi || !levels) return null;

  const shown = {
    entry: drag?.kind === "entry" ? drag.price : levels.entry,
    takeProfit: drag?.kind === "takeProfit" ? drag.price : levels.takeProfit,
    stopLoss: drag?.kind === "stopLoss" ? drag.price : levels.stopLoss,
  };

  const priceAt = (clientY: number, el: HTMLElement): number | null => {
    const y = clientY - el.getBoundingClientRect().top;
    const price = chartApi.series.coordinateToPrice(y);
    return price == null || !Number.isFinite(price) ? null : price;
  };

  const drop = (kind: LineKind, price: number) => {
    const base = levels;
    const entryNow = kind === "entry" ? price : base.entry;
    const moved = snap(keepLongSide(kind, price, kind === "entry" ? null : entryNow), kr);
    const next: Levels = {
      ...base,
      entry: kind === "entry" ? moved : base.entry,
      takeProfit:
        kind === "takeProfit"
          ? moved
          : base.takeProfit != null && entryNow != null && base.takeProfit <= entryNow
            ? snap(entryNow * 1.03, kr)
            : base.takeProfit,
      stopLoss:
        kind === "stopLoss"
          ? moved
          : base.stopLoss != null && entryNow != null && base.stopLoss >= entryNow
            ? snap(entryNow * 0.97, kr)
            : base.stopLoss,
      armedTake: base.armedTake || kind === "takeProfit",
      armedStop: base.armedStop || kind === "stopLoss",
    };

    const arming =
      (kind === "takeProfit" && !base.armedTake) || (kind === "stopLoss" && !base.armedStop);
    if (arming && base.live) {
      const name = symbol?.nameKo || symbol?.ticker || base.code;
      const ok = window.confirm(
        `${name} ${LABEL[kind]} ${formatPrice(moved, kr)} 감시를 켭니다.\n` +
          `가격이 닿으면 보유 ${base.qty.toLocaleString("ko-KR")}주를 시장가로 매도합니다. 실전 계좌입니다. 계속할까요?`
      );
      if (!ok) return;
    }

    holdLines(symbolId);
    setLevels(next);
    setLines({
      symbolId,
      entry: next.entry,
      takeProfit: next.takeProfit,
      stopLoss: next.stopLoss,
    });
    if (!next.code || next.entry == null) return;
    void fetch("/api/kiwoom/brackets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbolId,
        code: next.code,
        qty: next.qty,
        entryPrice: next.entry,
        takeProfit: next.armedTake ? next.takeProfit : null,
        stopLoss: next.armedStop ? next.stopLoss : null,
      }),
    }).catch(() => undefined);
  };

  const rows: { kind: LineKind; price: number | null; armed: boolean }[] = [
    { kind: "entry", price: shown.entry, armed: true },
    { kind: "takeProfit", price: shown.takeProfit, armed: levels.armedTake },
    { kind: "stopLoss", price: shown.stopLoss, armed: levels.armedStop },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-20" data-feature="trade.chart.lines">
      {rows.map((row) => {
        if (row.price == null) return null;
        const y = chartApi.series.priceToCoordinate(row.price);
        if (y == null) return null;
        const suggestion = row.kind !== "entry" && !row.armed;
        return (
          <div
            key={row.kind}
            className={
              kr
                ? "pointer-events-auto absolute left-0 right-0 h-4 -translate-y-1/2 cursor-ns-resize"
                : "absolute left-0 right-0 h-4 -translate-y-1/2"
            }
            style={{ top: y }}
            title={
              suggestion
                ? kr
                  ? "감시 중이 아닌 제안선입니다. 끌어 놓으면 이 가격으로 감시를 켭니다."
                  : "국내 종목만 목표가·손절 감시를 할 수 있습니다."
                : undefined
            }
            onPointerDown={(ev) => {
              if (!kr) return;
              dragRef.current = { startY: ev.clientY };
              ev.currentTarget.setPointerCapture(ev.pointerId);
              ev.stopPropagation();
              setDrag({ kind: row.kind, price: row.price! });
            }}
            onPointerMove={(ev) => {
              if (!dragRef.current) return;
              const price = priceAt(ev.clientY, ev.currentTarget.parentElement ?? ev.currentTarget);
              if (price == null) return;
              setDrag({
                kind: row.kind,
                price: keepLongSide(row.kind, price, row.kind === "entry" ? null : levels.entry),
              });
            }}
            onPointerUp={(ev) => {
              const start = dragRef.current;
              dragRef.current = null;
              setDrag(null);
              if (!start || Math.abs(ev.clientY - start.startY) < DRAG_THRESHOLD_PX) return;
              const price = priceAt(ev.clientY, ev.currentTarget.parentElement ?? ev.currentTarget);
              if (price != null) drop(row.kind, price);
            }}
            onPointerCancel={() => {
              dragRef.current = null;
              setDrag(null);
            }}
          >
            <div
              className="absolute left-0 right-16 top-1/2 border-t"
              style={{ borderColor: COLOR[row.kind], borderTopStyle: suggestion ? "dashed" : "solid" }}
            />
            <div
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[10px] text-black"
              style={{ background: COLOR[row.kind], opacity: suggestion ? 0.7 : 1 }}
            >
              {LABEL[row.kind]} {formatPrice(row.price, kr)}
              {suggestion ? " · 미설정" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
