import type { Candle, Timeframe } from "@/lib/types";
import type { CandleQuery } from "@/lib/market-data/types";
import { secondsPerBar } from "@/lib/market-data/types";

type TickListener = (candle: Candle) => void;

interface YahooPollSession {
  last: Candle | null;
  listeners: Set<TickListener>;
  timer: ReturnType<typeof setInterval> | null;
  booting: boolean;
}

const pollSessions = new Map<string, YahooPollSession>();

/** Symbols with no Yahoo mapping — callers should use mock. */
const UNMAPPED = new Set(["MAG7", "VNPA"]);

/**
 * Map ChartDesk ticker → Yahoo Finance chart symbol.
 * Returns null when the symbol should stay on mock (synthetic baskets / OTC stubs).
 */
export function toYahooSymbol(
  ticker: string,
  exchange?: string,
  assetClass?: string
): string | null {
  const t = ticker.trim().toUpperCase();
  if (!t || UNMAPPED.has(t)) return null;

  if (t === "SPX500" || t === "^GSPC" || t === "GSPC") return "^GSPC";
  if (t === "SOX" || t === "^SOX") return "^SOX";

  if (
    assetClass === "crypto" ||
    t.endsWith("USDT") ||
    t.endsWith("-USD") ||
    t === "BTC" ||
    t === "ETH"
  ) {
    if (t.startsWith("BTC")) return "BTC-USD";
    if (t.startsWith("ETH")) return "ETH-USD";
  }

  if (
    assetClass === "kr_stock" ||
    exchange === "KRX" ||
    /^\d{6}$/.test(t)
  ) {
    return `${t}.KS`;
  }

  // Already a Yahoo-style symbol
  if (t.includes(".") || t.startsWith("^")) return t;

  // US equities / ETFs
  return t;
}

function yahooIntervalAndRange(
  tf: Timeframe
): { interval: string; range: string; aggregate?: number } {
  switch (tf) {
    case "tick":
    case "1":
      return { interval: "1m", range: "7d" };
    case "3":
      // Yahoo has no 3m — pull 1m and aggregate ×3
      return { interval: "1m", range: "7d", aggregate: 3 };
    case "5":
      return { interval: "5m", range: "60d" };
    case "10":
      return { interval: "5m", range: "60d", aggregate: 2 };
    case "15":
      return { interval: "15m", range: "60d" };
    case "30":
      return { interval: "30m", range: "60d" };
    case "60":
      return { interval: "60m", range: "6mo" };
    case "120":
      return { interval: "60m", range: "6mo", aggregate: 2 };
    case "240":
      return { interval: "60m", range: "6mo", aggregate: 4 };
    case "D":
      return { interval: "1d", range: "2y" };
    case "W":
      return { interval: "1wk", range: "5y" };
    case "M":
      return { interval: "1mo", range: "10y" };
    default:
      return { interval: "1d", range: "1y" };
  }
}

function aggregateBars(bars: Candle[], factor: number): Candle[] {
  if (factor <= 1 || bars.length === 0) return bars;
  const out: Candle[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (!chunk.length) continue;
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    out.push({
      time: first.time,
      open: first.open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: last.close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

interface YahooChartResult {
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

function parseYahooChart(json: unknown): Candle[] {
  const root = json as {
    chart?: { result?: YahooChartResult[]; error?: unknown };
  };
  const result = root?.chart?.result?.[0];
  if (!result?.timestamp?.length) return [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) return [];

  const bars: Candle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const t = result.timestamp[i];
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if (
      t == null ||
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    bars.push({
      time: t,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume ?? NaN) ? Number(volume) : 0,
    });
  }
  return bars;
}

export interface YahooSessionSnapshot {
  closes: { time: number; close: number }[];
  livePrice: number | null;
  prePrice: number | null;
  marketState: string | null;
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Daily closes plus the live and pre-market prices Yahoo prints in chart meta. */
export async function fetchYahooSessionSnapshot(
  ticker: string,
  exchange?: string,
  assetClass?: string
): Promise<YahooSessionSnapshot | null> {
  const yahooSym = toYahooSymbol(ticker, exchange, assetClass);
  if (!yahooSym) return null;
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}`
  );
  url.searchParams.set("interval", "1d");
  url.searchParams.set("range", "10d");
  url.searchParams.set("includePrePost", "true");
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ChartDesk/1.0; +https://github.com/TeslaOptimusK/chartdesk)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
          meta?: {
            regularMarketPrice?: number;
            preMarketPrice?: number;
            marketState?: string;
          };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const times = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const bars: { time: number; close: number }[] = [];
    for (let i = 0; i < times.length; i++) {
      const time = times[i];
      const close = closes[i];
      if (time == null || close == null || !Number.isFinite(close) || close <= 0) continue;
      bars.push({ time, close });
    }
    const meta = result.meta;
    return {
      closes: bars,
      livePrice: numOrNull(meta?.regularMarketPrice),
      prePrice: numOrNull(meta?.preMarketPrice),
      marketState: typeof meta?.marketState === "string" ? meta.marketState : null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch OHLCV from Yahoo Finance chart API (no API key).
 * Returns null when unmapped or the request fails.
 */
export async function fetchYahooCandles(
  query: CandleQuery
): Promise<Candle[] | null> {
  const yahooSym = toYahooSymbol(
    query.ticker,
    query.exchange,
    query.assetClass
  );
  if (!yahooSym) return null;

  const { interval, range, aggregate } = yahooIntervalAndRange(query.timeframe);
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}`
  );
  url.searchParams.set("interval", interval);
  url.searchParams.set("range", range);
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div|split");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ChartDesk/1.0; +https://github.com/TeslaOptimusK/chartdesk)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    let bars = parseYahooChart(json);
    if (aggregate && aggregate > 1) {
      bars = aggregateBars(bars, aggregate);
    }
    if (!bars.length) return null;

    if (query.from != null || query.to != null) {
      bars = bars.filter((b) => {
        if (query.from != null && b.time < query.from) return false;
        if (query.to != null && b.time > query.to) return false;
        return true;
      });
    }

    const limit = query.limit ?? bars.length;
    if (bars.length > limit) {
      bars = bars.slice(-limit);
    }
    return bars;
  } catch {
    return null;
  }
}

function pollKey(query: CandleQuery): string {
  return `${query.symbolId}|${query.timeframe}|yahoo`;
}

function emitPoll(session: YahooPollSession) {
  if (!session.last) return;
  const snap = { ...session.last };
  for (const fn of session.listeners) fn(snap);
}

async function refreshSession(
  key: string,
  session: YahooPollSession,
  query: CandleQuery
) {
  const stillAlive = () =>
    pollSessions.get(key) === session && session.listeners.size > 0;
  try {
    const bars = await fetchYahooCandles({ ...query, limit: 2 });
    if (!stillAlive() || !bars?.length) return;
    const last = bars[bars.length - 1]!;
    // Align forming bar time to ChartDesk step when Yahoo interval is coarser
    const step = secondsPerBar(query.timeframe);
    const aligned: Candle = {
      ...last,
      time: Math.floor(last.time / step) * step || last.time,
    };
    session.last = aligned;
    emitPoll(session);
  } catch {
    /* keep last print */
  }
}

/**
 * Shared Yahoo poll so chart SSE + watchlist quotes-sse share one last print.
 */
export function createYahooPollSubscriber(
  query: CandleQuery,
  onCandle: (candle: Candle) => void,
  pollMs?: number
): () => void {
  const key = pollKey(query);
  const ms = Math.max(
    1_000,
    pollMs ?? Number(process.env.MARKET_DATA_POLL_MS ?? 30_000)
  );

  let session = pollSessions.get(key);
  if (!session) {
    session = {
      last: null,
      listeners: new Set(),
      timer: null,
      booting: false,
    };
    pollSessions.set(key, session);
  }

  session.listeners.add(onCandle);
  if (session.last) onCandle({ ...session.last });

  if (!session.timer && !session.booting) {
    session.booting = true;
    void refreshSession(key, session, query).finally(() => {
      const current = pollSessions.get(key);
      if (!current || current !== session) return;
      current.booting = false;
      if (current.listeners.size === 0) return;
      if (!current.timer) {
        current.timer = setInterval(() => {
          void refreshSession(key, current, query);
        }, ms);
      }
    });
  }

  return () => {
    const current = pollSessions.get(key);
    if (!current) return;
    current.listeners.delete(onCandle);
    if (current.listeners.size === 0) {
      if (current.timer) clearInterval(current.timer);
      pollSessions.delete(key);
    }
  };
}
