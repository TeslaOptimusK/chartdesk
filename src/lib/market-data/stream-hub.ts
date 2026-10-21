import { randomUUID } from "crypto";
import type { MarketDataAdapter } from "@/lib/market-data/types";
import type { Candle, SymbolMeta, Timeframe } from "@/lib/types";

/**
 * One server-sent event stream per browser window carries every chart pane's
 * forming bar and the watchlist quotes. Browsers allow six HTTP/1.1
 * connections per host, so one stream per pane left the rest of the API a
 * single connection in the four-pane layout.
 */

export const MAX_CHART_STREAMS = 8;
export const MAX_QUOTE_STREAMS = 60;

export interface StreamSubscriptions {
  charts: { symbolId: string; tf: Timeframe }[];
  quotes: { ids: string[]; tf: Timeframe } | null;
}

export type StreamMessage =
  | { type: "hello"; streamId: string; adapter: string }
  | { type: "candle"; symbolId: string; tf: Timeframe; candle: Candle }
  | {
      type: "quote";
      symbolId: string;
      candle: Candle;
      prevClose?: number;
      barRoll?: boolean;
    };

export interface StreamClient {
  readonly id: string;
  /** Subscribe what is new in `next`, drop what is gone. Unknown symbols are skipped. */
  update(next: StreamSubscriptions, lookup: (symbolId: string) => SymbolMeta | undefined): void;
  close(): void;
}

function queryFor(symbol: SymbolMeta, tf: Timeframe) {
  return {
    symbolId: symbol.id,
    ticker: symbol.ticker,
    exchange: symbol.exchange,
    assetClass: symbol.assetClass,
    timeframe: tf === "tick" ? ("1" as Timeframe) : tf,
    limit: 2,
  };
}

export function createStreamClient(opts: {
  adapter: MarketDataAdapter;
  send: (message: StreamMessage) => void;
  id?: string;
}): StreamClient {
  const { adapter, send } = opts;
  const id = opts.id ?? randomUUID();
  const charts = new Map<string, () => void>();
  const quotes = new Map<string, () => void>();
  let closed = false;

  const subscribeChart = (symbol: SymbolMeta, tf: Timeframe): (() => void) => {
    if (!adapter.subscribe) return () => undefined;
    return adapter.subscribe(queryFor(symbol, tf), (candle) => {
      if (!closed) send({ type: "candle", symbolId: symbol.id, tf, candle });
    });
  };

  /** History seeds the quote until the shared live bar arrives; a late seed never overwrites a tick. */
  const subscribeQuote = (symbol: SymbolMeta, tf: Timeframe): (() => void) => {
    if (!adapter.subscribe) return () => undefined;
    const query = queryFor(symbol, tf);
    let stopped = false;
    let live = false;
    let prevClose: number | undefined;
    let lastBarTime: number | undefined;
    void adapter
      .getCandles(query)
      .then((bars) => {
        if (stopped || live || closed) return;
        const last = bars.at(-1);
        if (!last) return;
        const prev = bars.length > 1 ? bars[bars.length - 2] : null;
        prevClose = prev?.close ?? last.open;
        send({ type: "quote", symbolId: symbol.id, candle: last, prevClose });
      })
      .catch(() => undefined);
    const unsub = adapter.subscribe(query, (candle) => {
      if (stopped || closed) return;
      live = true;
      if (prevClose == null) prevClose = candle.open;
      const barRoll = lastBarTime != null && candle.time !== lastBarTime;
      if (barRoll) prevClose = candle.open;
      lastBarTime = candle.time;
      send({ type: "quote", symbolId: symbol.id, candle, prevClose, barRoll });
    });
    return () => {
      stopped = true;
      unsub();
    };
  };

  const sync = (
    current: Map<string, () => void>,
    wanted: Map<string, { symbolId: string; tf: Timeframe }>,
    lookup: (symbolId: string) => SymbolMeta | undefined,
    start: (symbol: SymbolMeta, tf: Timeframe) => () => void
  ) => {
    for (const [key, stop] of current) {
      if (wanted.has(key)) continue;
      stop();
      current.delete(key);
    }
    for (const [key, want] of wanted) {
      if (current.has(key)) continue;
      const symbol = lookup(want.symbolId);
      if (!symbol) continue;
      current.set(key, start(symbol, want.tf));
    }
  };

  return {
    id,
    update(next, lookup) {
      if (closed) return;
      const wantedCharts = new Map<string, { symbolId: string; tf: Timeframe }>();
      for (const chart of next.charts.slice(0, MAX_CHART_STREAMS)) {
        wantedCharts.set(`${chart.symbolId}|${chart.tf}`, chart);
      }
      const wantedQuotes = new Map<string, { symbolId: string; tf: Timeframe }>();
      if (next.quotes) {
        for (const symbolId of next.quotes.ids.slice(0, MAX_QUOTE_STREAMS)) {
          wantedQuotes.set(`${symbolId}|${next.quotes.tf}`, { symbolId, tf: next.quotes.tf });
        }
      }
      sync(charts, wantedCharts, lookup, subscribeChart);
      sync(quotes, wantedQuotes, lookup, subscribeQuote);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const stop of charts.values()) stop();
      for (const stop of quotes.values()) stop();
      charts.clear();
      quotes.clear();
    },
  };
}

/** The GET that opens a stream and the POSTs that change it can land in different module copies. */
const registry: Map<string, StreamClient> = ((
  globalThis as typeof globalThis & { __chartdeskStreams?: Map<string, StreamClient> }
).__chartdeskStreams ??= new Map());

export function registerStreamClient(client: StreamClient): void {
  registry.set(client.id, client);
}

export function unregisterStreamClient(id: string): void {
  registry.delete(id);
}

export function findStreamClient(id: string): StreamClient | undefined {
  return registry.get(id);
}
