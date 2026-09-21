import type { Candle } from "@/lib/types";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";
import { secondsPerBar } from "@/lib/market-data/types";

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function basePrice(ticker: string): number {
  if (ticker.includes("BTC")) return 68000;
  if (ticker.includes("ETH")) return 3400;
  if (ticker === "005930") return 78000;
  if (ticker === "000660") return 185000;
  if (ticker === "AAPL") return 190;
  if (ticker === "NVDA") return 120;
  if (ticker === "TSLA") return 250;
  return 100 + (hashSeed(ticker) % 400);
}

/** KRX 6-digit codes trade in whole won — mock floats were showing fake cents. */
export function roundPx(ticker: string, n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (/^\d{6}$/.test(ticker)) return Math.round(n);
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 100 : 10000;
  return Math.round(n * digits) / digits;
}

function clampOhlc(ticker: string, bar: Candle): Candle {
  const open = roundPx(ticker, bar.open);
  const close = roundPx(ticker, bar.close);
  let high = roundPx(ticker, Math.max(bar.high, open, close));
  let low = roundPx(ticker, Math.min(bar.low, open, close));
  const top = Math.max(open, close);
  const bot = Math.min(open, close);
  if (high < top) high = top;
  if (low > bot) low = bot;
  if (low <= 0) low = bot > 0 ? bot : roundPx(ticker, 0.01);
  return { ...bar, open, high, low, close };
}

/**
 * Close at an absolute bar index. Independent of query limit / window start,
 * so a 2-bar seed and a 240-bar chart share the same last print.
 * Mean-reverts around the symbol base — no multi-month random-walk drift.
 */
function closeAt(query: CandleQuery, time: number, step: number): number {
  const base = basePrice(query.ticker);
  const idx = Math.floor(time / step);
  const rand = mulberry32(
    hashSeed(`${query.symbolId}:${query.timeframe}:${idx}`)
  );
  const wave = Math.sin(idx / 17) * 0.012 + Math.sin(idx / 6.5) * 0.005;
  const noise = (rand() - 0.5) * 0.003;
  return roundPx(query.ticker, Math.max(0.01, base * (1 + wave + noise)));
}

/** Deterministic OHLCV so the app runs without API keys. */
export function generateMockCandles(query: CandleQuery): Candle[] {
  const limit = query.limit ?? 180;
  const step = secondsPerBar(query.timeframe);
  const end = query.to ?? Math.floor(Date.now() / 1000);
  const alignedEnd = end - (end % step);
  const start = query.from ?? alignedEnd - step * (limit - 1);
  const candles: Candle[] = [];

  for (let t = start; t <= alignedEnd; t += step) {
    const idx = Math.floor(t / step);
    const open = closeAt(query, t - step, step);
    const close = closeAt(query, t, step);
    const wickRand = mulberry32(
      hashSeed(`${query.symbolId}:${query.timeframe}:${idx}:wick`)
    );
    const body = Math.abs(close - open);
    const base = basePrice(query.ticker);
    const wick =
      Math.max(body * 0.45, base * 0.0008) * (0.35 + wickRand() * 0.45);
    const volRand = mulberry32(
      hashSeed(`${query.symbolId}:${query.timeframe}:${idx}:vol`)
    );
    candles.push(
      clampOhlc(query.ticker, {
        time: t,
        open,
        high: Math.max(open, close) + wick,
        low: Math.max(0.01, Math.min(open, close) - wick),
        close,
        volume: Math.floor(800_000 + volRand() * 2_500_000),
      })
    );
  }
  return candles;
}

function barTime(nowSec: number, step: number): number {
  return nowSec - (nowSec % step);
}

/**
 * Reject a live print that does not belong to this series (for example a
 * 2-bar walk restarted at the base price merged onto a longer window).
 */
export function isAlienPrint(
  reference: number,
  value: number,
  maxJump = 0.03
): boolean {
  if (!Number.isFinite(reference) || reference === 0) return false;
  if (!Number.isFinite(value)) return true;
  return Math.abs(value - reference) / Math.abs(reference) > maxJump;
}

/**
 * Fold one live bar into a candle series without inventing a one-bar crash.
 * Same-time ticks keep the historical open and nudge close; a close (or a new
 * bar's open) that jumps more than `maxJump` is ignored.
 */
export function applyLiveCandle(
  prev: Candle[],
  next: Candle,
  opts?: { streamTf?: string; maxJump?: number }
): Candle[] {
  if (!prev.length) return prev;
  const last = prev[prev.length - 1]!;
  const streamTf = opts?.streamTf;
  const maxJump = opts?.maxJump;

  if (next.time < last.time) {
    if (streamTf !== "tick") return prev;
    if (isAlienPrint(last.close, next.close, maxJump)) return prev;
    return [
      ...prev.slice(0, -1),
      {
        ...last,
        close: next.close,
        high: Math.max(last.high, next.high, next.close),
        low: Math.min(last.low, next.low, next.close),
        volume: last.volume,
      },
    ];
  }

  if (last.time === next.time) {
    if (isAlienPrint(last.close, next.close, maxJump)) return prev;
    return [
      ...prev.slice(0, -1),
      {
        time: next.time,
        open: last.open,
        close: next.close,
        high: Math.max(last.high, next.high, next.close, last.open),
        low: Math.min(last.low, next.low, next.close, last.open),
        volume: Math.max(last.volume, next.volume),
      },
    ];
  }

  if (streamTf === "tick") {
    if (isAlienPrint(last.close, next.close, maxJump)) return prev;
    return [
      ...prev.slice(0, -1),
      {
        time: last.time,
        open: last.open,
        close: next.close,
        high: Math.max(last.high, next.high, next.close),
        low: Math.min(last.low, next.low, next.close),
        volume: last.volume + Math.max(1, Math.floor(next.volume / 20)),
      },
    ];
  }

  if (isAlienPrint(last.close, next.open, maxJump)) return prev;
  return [...prev, next];
}

function rollOrSeed(ticker: string, prevClose: number, t: number): Candle {
  const open = roundPx(ticker, Math.max(0.01, prevClose));
  return clampOhlc(ticker, {
    time: t,
    open,
    high: open,
    low: open,
    close: open,
    volume: Math.floor(1_000 + Math.random() * 4_000),
  });
}

type TickListener = (candle: Candle) => void;

interface FormingSession {
  forming: Candle | null;
  listeners: Set<TickListener>;
  timer: ReturnType<typeof setInterval> | null;
}

const formingSessions = new Map<string, FormingSession>();

function sessionKey(query: CandleQuery): string {
  return `${query.symbolId}|${query.timeframe}`;
}

function emitSession(session: FormingSession) {
  if (!session.forming) return;
  const snap = { ...session.forming };
  for (const fn of session.listeners) fn(snap);
}

/**
 * Live forming-bar ticker for mock/realtime demos.
 * One in-memory bar per symbol+timeframe so the chart SSE and the watchlist
 * quote SSE cannot walk two different prices.
 */
export function createFormingBarSubscriber(
  query: CandleQuery,
  onCandle: (candle: Candle) => void,
  getSeedBars: (q: CandleQuery) => Promise<Candle[]>
): () => void {
  const key = sessionKey(query);
  let session = formingSessions.get(key);
  if (!session) {
    session = { forming: null, listeners: new Set(), timer: null };
    formingSessions.set(key, session);
    void bootFormingSession(key, session, query, getSeedBars);
  }
  session.listeners.add(onCandle);
  if (session.forming) onCandle({ ...session.forming });

  return () => {
    const current = formingSessions.get(key);
    if (!current) return;
    current.listeners.delete(onCandle);
    if (current.listeners.size === 0) {
      if (current.timer) clearInterval(current.timer);
      formingSessions.delete(key);
    }
  };
}

async function bootFormingSession(
  key: string,
  session: FormingSession,
  query: CandleQuery,
  getSeedBars: (q: CandleQuery) => Promise<Candle[]>
) {
  const step = secondsPerBar(query.timeframe);
  const tickMs = Math.max(250, Number(process.env.MARKET_DATA_TICK_MS ?? 1000));
  const walkPct = step <= 60 ? 0.0008 : step <= 300 ? 0.0005 : 0.00035;
  const capPct = step <= 60 ? 0.008 : 0.012;

  const stillAlive = () =>
    formingSessions.get(key) === session && session.listeners.size > 0;

  try {
    const bars = await getSeedBars({ ...query, limit: 2 });
    if (!stillAlive()) return;
    const last = bars.at(-1);
    const t = barTime(Math.floor(Date.now() / 1000), step);
    if (last && last.time === t) {
      session.forming = clampOhlc(query.ticker, { ...last });
    } else if (last) {
      session.forming = rollOrSeed(query.ticker, last.close, t);
    } else {
      session.forming = rollOrSeed(query.ticker, basePrice(query.ticker), t);
    }
  } catch {
    if (!stillAlive()) return;
    session.forming = rollOrSeed(
      query.ticker,
      basePrice(query.ticker),
      barTime(Math.floor(Date.now() / 1000), step)
    );
  }

  if (!stillAlive()) return;
  emitSession(session);

  session.timer = setInterval(() => {
    if (!stillAlive() || !session.forming) return;
    const t = barTime(Math.floor(Date.now() / 1000), step);
    if (session.forming.time !== t) {
      session.forming = rollOrSeed(query.ticker, session.forming.close, t);
    } else {
      const open = session.forming.open;
      const bump = (Math.random() - 0.5) * walkPct * 2;
      const cap = Math.max(Math.abs(open) * capPct, 0.01);
      let nextClose = session.forming.close * (1 + bump);
      nextClose = Math.min(open + cap, Math.max(open - cap, nextClose));
      session.forming = clampOhlc(query.ticker, {
        ...session.forming,
        close: nextClose,
        high: Math.max(session.forming.high, nextClose, open),
        low: Math.min(session.forming.low, nextClose, open),
        volume: session.forming.volume + Math.floor(200 + Math.random() * 6_000),
      });
    }
    emitSession(session);
  }, tickMs);
}

export class MockMarketDataAdapter implements MarketDataAdapter {
  readonly id = "mock";
  readonly label = "Mock (offline)";
  readonly mode = "mock" as const;

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    return generateMockCandles(query);
  }

  subscribe(query: CandleQuery, onCandle: (candle: Candle) => void) {
    return createFormingBarSubscriber(query, onCandle, (q) =>
      this.getCandles(q)
    );
  }
}
