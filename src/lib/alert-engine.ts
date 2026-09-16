import { rsi } from "@/lib/indicators";
import { createMarketDataAdapter } from "@/lib/market-data";
import { deliverAlertWebhook } from "@/lib/webhook-deliver";
import {
  addAlert,
  readStore,
  saveMultiConditionAlerts,
  savePriceWatches,
  saveTechnicalAlerts,
} from "@/lib/storage";
import type {
  AlertItem,
  Candle,
  Drawing,
  MultiConditionAlert,
  MultiAlertCondition,
  PriceWatch,
  SymbolMeta,
  TechnicalAlert,
  Timeframe,
} from "@/lib/types";

export interface EvaluateAlertsInput {
  symbolId: string;
  candles: Candle[];
  lastClose?: number;
}

export interface EvaluateAlertsResult {
  fired: AlertItem[];
  priceWatches: PriceWatch[];
  technicalAlerts: TechnicalAlert[];
  multiConditionAlerts: MultiConditionAlert[];
}

function lastRsi(candles: Candle[]): number | null {
  const series = rsi(candles, 14);
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v != null) return v;
  }
  return null;
}

function indicatorCond(candles: Candle[], cond: MultiAlertCondition): boolean {
  const id = cond.indicatorId ?? "rsi";
  if (id !== "rsi") return false;
  const rv = lastRsi(candles);
  if (rv == null) return false;
  if (cond.op === "above") return rv >= cond.threshold;
  return rv <= cond.threshold;
}

function evalMultiCondition(
  candles: Candle[],
  close: number,
  prevClose: number | null,
  alert: MultiConditionAlert
): boolean {
  const results = alert.conditions.map((c) => {
    if (c.kind === "price") {
      if (c.op === "above") return close >= c.threshold;
      return close <= c.threshold;
    }
    return indicatorCond(candles, c);
  });
  return alert.logic === "and"
    ? results.every(Boolean)
    : results.some(Boolean);
}

function drawingLevel(drawing: Drawing): number | null {
  if (drawing.points.length === 0) return null;
  if (
    drawing.tool === "horizontal" ||
    drawing.tool === "horizontal_ray"
  ) {
    return drawing.points[0].price;
  }
  return null;
}

function evalPriceWatch(
  w: PriceWatch,
  close: number,
  prevClose: number | null
): boolean {
  if (w.op === "above") return close >= w.price;
  if (w.op === "below") return close <= w.price;
  if (w.op === "crossing" && prevClose != null) {
    return (
      (prevClose < w.price && close >= w.price) ||
      (prevClose > w.price && close <= w.price)
    );
  }
  return false;
}

function evalTechnical(
  ta: TechnicalAlert,
  close: number,
  prevClose: number | null,
  drawings: Drawing[],
  candles: Candle[]
): boolean {
  if (ta.kind === "drawing") {
    const d =
      drawings.find((x) => x.id === ta.targetId) ??
      drawings.find((x) => x.id.includes(ta.targetId));
    const level = d ? drawingLevel(d) : null;
    if (level == null) return false;
    if (prevClose == null) return false;
    return (
      (prevClose < level && close >= level) ||
      (prevClose > level && close <= level)
    );
  }
  const rv = lastRsi(candles);
  if (rv == null) return false;
  const threshold = Number(ta.label) || Number(ta.targetId) || 70;
  if (ta.message?.includes("below") || ta.label.toLowerCase().includes("below")) {
    return rv <= threshold;
  }
  return rv >= threshold;
}

async function fireAlert(
  partial: Omit<AlertItem, "id" | "firedAt" | "read">
): Promise<AlertItem> {
  const alert = await addAlert(partial);
  await deliverAlertWebhook(alert);
  return alert;
}

/** Evaluate watches, technical, and multi alerts for one symbol; persist triggered flags. */
export async function evaluateSymbolAlerts(
  input: EvaluateAlertsInput
): Promise<EvaluateAlertsResult> {
  const store = await readStore();
  const symbol = store.symbols.find((s) => s.id === input.symbolId);
  const candles = input.candles;
  if (!candles.length) {
    return {
      fired: [],
      priceWatches: store.priceWatches ?? [],
      technicalAlerts: store.technicalAlerts ?? [],
      multiConditionAlerts: store.multiConditionAlerts ?? [],
    };
  }

  const last = candles[candles.length - 1];
  const close = input.lastClose ?? last.close;
  const prev =
    candles.length > 1 ? candles[candles.length - 2].close : null;
  const prevClose = prev;

  const fired: AlertItem[] = [];
  let priceWatches = [...(store.priceWatches ?? [])];
  let technicalAlerts = [...(store.technicalAlerts ?? [])];
  let multiConditionAlerts = [...(store.multiConditionAlerts ?? [])];

  const symbolDrawings = store.drawings.filter(
    (d) => d.symbolId === input.symbolId
  );

  for (const w of priceWatches) {
    if (w.symbolId !== input.symbolId || w.triggered) continue;
    if (!evalPriceWatch(w, close, prevClose)) continue;
    priceWatches = priceWatches.map((x) =>
      x.id === w.id ? { ...x, triggered: true, lastClose: close } : x
    );
    const opLabel =
      w.op === "above" ? "이상" : w.op === "below" ? "이하" : "돌파";
    const meta = symbol as SymbolMeta | undefined;
    fired.push(
      await fireAlert({
        type: "price",
        title: `가격 알림 ${opLabel} ${w.price}`,
        message:
          w.message?.trim() ||
          `${meta?.ticker ?? input.symbolId} 종가 ${close.toFixed(2)} (${opLabel} ${w.price})`,
        symbolId: input.symbolId,
      })
    );
  }

  for (const ta of technicalAlerts) {
    if (ta.symbolId !== input.symbolId || ta.triggered) continue;
    if (!evalTechnical(ta, close, prevClose, symbolDrawings, candles)) continue;
    technicalAlerts = technicalAlerts.map((x) =>
      x.id === ta.id ? { ...x, triggered: true } : x
    );
    fired.push(
      await fireAlert({
        type: ta.kind === "drawing" ? "drawing" : "indicator",
        title: `기술 알림 · ${ta.label}`,
        message:
          ta.message?.trim() ||
          `${metaLabel(symbol)} · ${ta.kind} ${ta.label} 트리거`,
        symbolId: input.symbolId,
      })
    );
  }

  for (const ma of multiConditionAlerts) {
    if (ma.symbolId !== input.symbolId || ma.triggered) continue;
    if (!evalMultiCondition(candles, close, prevClose, ma)) continue;
    multiConditionAlerts = multiConditionAlerts.map((x) =>
      x.id === ma.id ? { ...x, triggered: true } : x
    );
    fired.push(
      await fireAlert({
        type: "price",
        title: `멀티조건 (${ma.logic.toUpperCase()})`,
        message:
          ma.message?.trim() ||
          `${metaLabel(symbol)} · ${ma.conditions.length}조건 충족`,
        symbolId: input.symbolId,
      })
    );
  }

  if (fired.length) {
    await savePriceWatches(priceWatches);
    await saveTechnicalAlerts(technicalAlerts);
    await saveMultiConditionAlerts(multiConditionAlerts);
  }

  return { fired, priceWatches, technicalAlerts, multiConditionAlerts };
}

function metaLabel(symbol: SymbolMeta | undefined): string {
  return symbol?.ticker ?? "symbol";
}

/**
 * Evaluate pending price / technical / multi watches across watchlist + any
 * symbol that still has untriggered alerts (mock/realtime tick path).
 */
export async function evaluatePendingWatchlistAlerts(opts?: {
  tf?: Timeframe;
  limit?: number;
}): Promise<EvaluateAlertsResult> {
  const store = await readStore();
  const pendingIds = new Set<string>();

  for (const w of store.priceWatches ?? []) {
    if (!w.triggered) pendingIds.add(w.symbolId);
  }
  for (const ta of store.technicalAlerts ?? []) {
    if (!ta.triggered) pendingIds.add(ta.symbolId);
  }
  for (const ma of store.multiConditionAlerts ?? []) {
    if (!ma.triggered) pendingIds.add(ma.symbolId);
  }
  // Only pull watchlist symbols that already have a pending watch of some kind
  // (avoid evaluating the entire list on every tick with no alerts).
  const hasPending =
    (store.priceWatches ?? []).some((w) => !w.triggered) ||
    (store.technicalAlerts ?? []).some((t) => !t.triggered) ||
    (store.multiConditionAlerts ?? []).some((m) => !m.triggered);

  if (!hasPending) {
    return {
      fired: [],
      priceWatches: store.priceWatches ?? [],
      technicalAlerts: store.technicalAlerts ?? [],
      multiConditionAlerts: store.multiConditionAlerts ?? [],
    };
  }

  const adapter = createMarketDataAdapter();
  const tf = opts?.tf ?? "D";
  const limit = opts?.limit ?? 120;
  const fired: AlertItem[] = [];
  let priceWatches = store.priceWatches ?? [];
  let technicalAlerts = store.technicalAlerts ?? [];
  let multiConditionAlerts = store.multiConditionAlerts ?? [];

  for (const symbolId of pendingIds) {
    const symbol = store.symbols.find((s) => s.id === symbolId);
    if (!symbol) continue;
    const candles = await adapter.getCandles({
      symbolId: symbol.id,
      ticker: symbol.ticker,
      timeframe: tf === "tick" ? "1" : tf,
      limit,
    });
    const result = await evaluateSymbolAlerts({ symbolId, candles });
    fired.push(...result.fired);
    priceWatches = result.priceWatches;
    technicalAlerts = result.technicalAlerts;
    multiConditionAlerts = result.multiConditionAlerts;
  }

  return { fired, priceWatches, technicalAlerts, multiConditionAlerts };
}
