import type { Candle, Timeframe } from "@/lib/types";

/**
 * Browser side of /api/market/stream. Every chart pane and the watchlist share
 * one EventSource; subscription changes are posted to the open stream, so
 * switching one pane's symbol does not restart the others.
 */

export interface QuoteMessage {
  symbolId: string;
  candle: Candle;
  prevClose?: number;
  barRoll?: boolean;
}

type CandleListener = (candle: Candle) => void;

interface ChartEntry {
  symbolId: string;
  tf: Timeframe;
  listeners: Set<CandleListener>;
}

const charts = new Map<string, ChartEntry>();
let quotes: { ids: string[]; tf: Timeframe; onQuote: (msg: QuoteMessage) => void } | null = null;
let source: EventSource | null = null;
let streamId: string | null = null;
let syncTimer: number | null = null;
let reopenTimer: number | null = null;
let syncChain: Promise<void> = Promise.resolve();

/** Unsubscribe-then-subscribe within this window (a pane remount) is one POST. */
const SYNC_DELAY_MS = 40;
/** Closing waits a moment so a layout change does not drop and recreate server sessions. */
const IDLE_CLOSE_MS = 3000;
const REOPEN_DELAY_MS = 3000;

function hasSubscriptions(): boolean {
  return charts.size > 0 || (quotes?.ids.length ?? 0) > 0;
}

function onMessage(ev: MessageEvent<string>): void {
  let msg: { type?: string; streamId?: string; symbolId?: string; tf?: string; candle?: Candle } & Partial<QuoteMessage>;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (msg.type === "hello" && msg.streamId) {
    streamId = msg.streamId;
    scheduleSync(0);
    return;
  }
  if (msg.type === "candle" && msg.symbolId && msg.candle) {
    const entry = charts.get(`${msg.symbolId}|${msg.tf}`);
    if (!entry) return;
    for (const listener of entry.listeners) listener(msg.candle);
    return;
  }
  if (msg.type === "quote" && msg.symbolId && msg.candle) {
    quotes?.onQuote({
      symbolId: msg.symbolId,
      candle: msg.candle,
      prevClose: msg.prevClose,
      barRoll: msg.barRoll,
    });
  }
}

function closeSource(): void {
  source?.close();
  source = null;
  streamId = null;
}

function openSource(): void {
  if (source || typeof window === "undefined") return;
  const es = new EventSource("/api/market/stream");
  source = es;
  es.onmessage = onMessage;
  es.onerror = () => {
    if (source !== es) return;
    // A reconnect gets a new streamId in its hello, which posts the subscriptions again.
    streamId = null;
    if (es.readyState !== EventSource.CLOSED) return;
    source = null;
    if (reopenTimer != null) return;
    reopenTimer = window.setTimeout(() => {
      reopenTimer = null;
      if (hasSubscriptions()) openSource();
    }, REOPEN_DELAY_MS);
  };
}

async function postSubscriptions(): Promise<void> {
  if (!hasSubscriptions()) {
    window.setTimeout(() => {
      if (!hasSubscriptions()) closeSource();
    }, IDLE_CLOSE_MS);
    return;
  }
  openSource();
  const id = streamId;
  if (!id) return;
  try {
    const res = await fetch("/api/market/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streamId: id,
        charts: [...charts.values()].map(({ symbolId, tf }) => ({ symbolId, tf })),
        quotes: quotes ? { ids: quotes.ids, tf: quotes.tf } : null,
      }),
    });
    if (res.status === 404 && streamId === id) {
      closeSource();
      openSource();
    }
  } catch {
    /* the next hello or change posts again */
  }
}

function scheduleSync(delay = SYNC_DELAY_MS): void {
  if (typeof window === "undefined") return;
  if (syncTimer != null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    syncChain = syncChain.then(postSubscriptions, postSubscriptions);
  }, delay);
}

/** Live forming bars for one chart pane. Returns the unsubscribe. */
export function subscribeChartStream(
  symbolId: string,
  tf: Timeframe,
  listener: CandleListener
): () => void {
  const key = `${symbolId}|${tf}`;
  let entry = charts.get(key);
  if (!entry) {
    entry = { symbolId, tf, listeners: new Set() };
    charts.set(key, entry);
    scheduleSync();
  }
  entry.listeners.add(listener);
  return () => {
    const current = charts.get(key);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    charts.delete(key);
    scheduleSync();
  };
}

/** Watchlist and header quotes. One consumer; a newer call replaces the older one. */
export function subscribeQuoteStream(
  ids: string[],
  tf: Timeframe,
  onQuote: (msg: QuoteMessage) => void
): () => void {
  const mine = { ids, tf, onQuote };
  quotes = mine;
  scheduleSync();
  return () => {
    if (quotes !== mine) return;
    quotes = null;
    scheduleSync();
  };
}
