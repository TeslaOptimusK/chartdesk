import type { Candle, Timeframe } from "@/lib/types";

export type CryptoVenue = "UPBIT" | "BITHUMB" | "BINANCE" | "BYBIT";

export interface VenueQuote {
  price: number;
  changePct: number;
  /** KRW on the Korean won books, USDT on the dollar books. */
  ccy: "KRW" | "USDT";
}

export function cryptoVenue(exchange: string | undefined): CryptoVenue | null {
  const key = (exchange ?? "").toUpperCase();
  if (key === "UPBIT" || key === "BITHUMB" || key === "BINANCE" || key === "BYBIT") return key;
  return null;
}

export function venueMarket(venue: CryptoVenue, ticker: string): string {
  const base = ticker.trim().toUpperCase().replace(/USDT$/, "");
  if (venue === "UPBIT") return `KRW-${base}`;
  if (venue === "BITHUMB") return `${base}_KRW`;
  return `${base}USDT`;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseUpbitTickers(body: unknown): Record<string, VenueQuote> {
  if (!Array.isArray(body)) return {};
  const out: Record<string, VenueQuote> = {};
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const market = String((row as { market?: string }).market ?? "");
    const base = market.startsWith("KRW-") ? market.slice(4) : "";
    const price = num((row as { trade_price?: unknown }).trade_price);
    const rate = num((row as { signed_change_rate?: unknown }).signed_change_rate);
    if (!base || price == null) continue;
    out[base] = { price, changePct: (rate ?? 0) * 100, ccy: "KRW" };
  }
  return out;
}

export function parseBithumbBook(body: unknown): Record<string, VenueQuote> {
  const data = (body as { data?: Record<string, unknown> } | null)?.data;
  if (!data) return {};
  const out: Record<string, VenueQuote> = {};
  for (const [key, row] of Object.entries(data)) {
    if (key === "date" || !row || typeof row !== "object") continue;
    const price = num((row as { closing_price?: unknown }).closing_price);
    const rate = num((row as { fluctate_rate_24H?: unknown }).fluctate_rate_24H);
    if (price == null) continue;
    out[key.toUpperCase()] = { price, changePct: rate ?? 0, ccy: "KRW" };
  }
  return out;
}

export function parseBinanceTickers(body: unknown): Record<string, VenueQuote> {
  if (!Array.isArray(body)) return {};
  const out: Record<string, VenueQuote> = {};
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const symbol = String((row as { symbol?: string }).symbol ?? "");
    if (!symbol.endsWith("USDT")) continue;
    const price = num((row as { lastPrice?: unknown }).lastPrice);
    const rate = num((row as { priceChangePercent?: unknown }).priceChangePercent);
    if (price == null) continue;
    out[symbol.slice(0, -4)] = { price, changePct: rate ?? 0, ccy: "USDT" };
  }
  return out;
}

export function parseBybitTickers(body: unknown): Record<string, VenueQuote> {
  const list = (body as { result?: { list?: unknown[] } } | null)?.result?.list;
  if (!Array.isArray(list)) return {};
  const out: Record<string, VenueQuote> = {};
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const symbol = String((row as { symbol?: string }).symbol ?? "");
    if (!symbol.endsWith("USDT")) continue;
    const price = num((row as { lastPrice?: unknown }).lastPrice);
    const rate = num((row as { price24hPcnt?: unknown }).price24hPcnt);
    if (price == null) continue;
    out[symbol.slice(0, -4)] = { price, changePct: (rate ?? 0) * 100, ccy: "USDT" };
  }
  return out;
}

function upbitUnit(tf: Timeframe): { path: string } | null {
  if (tf === "D") return { path: "days" };
  if (tf === "W") return { path: "weeks" };
  if (tf === "M") return { path: "months" };
  const minutes: Record<string, string> = {
    "1": "1",
    "3": "3",
    "5": "5",
    "10": "10",
    "15": "15",
    "30": "30",
    "60": "60",
    "240": "240",
  };
  const unit = minutes[tf];
  return unit ? { path: `minutes/${unit}` } : null;
}

export function upbitCandleUrl(ticker: string, tf: Timeframe, limit: number): string | null {
  const unit = upbitUnit(tf);
  if (!unit) return null;
  const count = Math.min(200, Math.max(1, limit));
  return `https://api.upbit.com/v1/candles/${unit.path}?market=${venueMarket("UPBIT", ticker)}&count=${count}`;
}

export function binanceInterval(tf: Timeframe): string | null {
  const table: Record<string, string> = {
    "1": "1m",
    "3": "3m",
    "5": "5m",
    "15": "15m",
    "30": "30m",
    "60": "1h",
    "120": "2h",
    "240": "4h",
    D: "1d",
    W: "1w",
    M: "1M",
  };
  return table[tf] ?? null;
}

export function parseBinanceKlines(body: unknown): Candle[] {
  if (!Array.isArray(body)) return [];
  const bars: Candle[] = [];
  for (const row of body) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = num(row[0]);
    const open = num(row[1]);
    const high = num(row[2]);
    const low = num(row[3]);
    const close = num(row[4]);
    const volume = num(row[5]) ?? 0;
    if (time == null || open == null || high == null || low == null || close == null) continue;
    bars.push({ time: Math.floor(time / 1000), open, high, low, close, volume });
  }
  return bars.sort((a, b) => a.time - b.time);
}

export function parseUpbitCandles(body: unknown): Candle[] {
  if (!Array.isArray(body)) return [];
  const bars: Candle[] = [];
  for (const row of body) {
    if (!row || typeof row !== "object") continue;
    const stamp = num((row as { timestamp?: unknown }).timestamp);
    const open = num((row as { opening_price?: unknown }).opening_price);
    const high = num((row as { high_price?: unknown }).high_price);
    const low = num((row as { low_price?: unknown }).low_price);
    const close = num((row as { trade_price?: unknown }).trade_price);
    const volume = num((row as { candle_acc_trade_volume?: unknown }).candle_acc_trade_volume) ?? 0;
    if (stamp == null || open == null || high == null || low == null || close == null) continue;
    bars.push({ time: Math.floor(stamp / 1000), open, high, low, close, volume });
  }
  return bars.sort((a, b) => a.time - b.time);
}

async function readJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Candle history from the exchange printed on the symbol. */
export async function fetchVenueCandles(
  exchange: string | undefined,
  ticker: string,
  tf: Timeframe,
  limit = 200
): Promise<Candle[] | null> {
  const venue = cryptoVenue(exchange);
  if (!venue) return null;
  const count = Math.min(200, Math.max(1, limit));
  if (venue === "UPBIT") {
    const url = upbitCandleUrl(ticker, tf, count);
    if (!url) return null;
    const body = await readJson(url);
    const bars = body ? parseUpbitCandles(body) : [];
    return bars.length ? bars : null;
  }
  if (venue === "BINANCE") {
    const interval = binanceInterval(tf);
    if (!interval) return null;
    const symbol = venueMarket("BINANCE", ticker);
    const body = await readJson(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${count}`
    );
    const bars = body ? parseBinanceKlines(body) : [];
    return bars.length ? bars : null;
  }
  return null;
}

export async function fetchVenueBooks(
  items: { ticker: string; exchange: string }[]
): Promise<Record<string, VenueQuote>> {
  const grouped = new Map<CryptoVenue, string[]>();
  for (const item of items) {
    const venue = cryptoVenue(item.exchange);
    if (!venue) continue;
    const base = item.ticker.trim().toUpperCase().replace(/USDT$/, "");
    const list = grouped.get(venue) ?? [];
    if (!list.includes(base)) list.push(base);
    grouped.set(venue, list);
  }
  const out: Record<string, VenueQuote> = {};
  const put = (venue: CryptoVenue, book: Record<string, VenueQuote>) => {
    for (const [base, quote] of Object.entries(book)) out[`${venue}|${base}`] = quote;
  };
  await Promise.all(
    [...grouped.entries()].map(async ([venue, bases]) => {
      if (venue === "UPBIT") {
        const markets = bases.map((base) => venueMarket("UPBIT", base)).join(",");
        const body = await readJson(`https://api.upbit.com/v1/ticker?markets=${markets}`);
        if (body) put("UPBIT", parseUpbitTickers(body));
        return;
      }
      if (venue === "BITHUMB") {
        const body = await readJson("https://api.bithumb.com/public/ticker/ALL_KRW");
        if (!body) return;
        const book = parseBithumbBook(body);
        put(
          "BITHUMB",
          Object.fromEntries(bases.filter((base) => book[base]).map((base) => [base, book[base]!]))
        );
        return;
      }
      if (venue === "BINANCE") {
        const symbols = bases.map((base) => venueMarket("BINANCE", base));
        const body = await readJson(
          `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
        );
        if (body) put("BINANCE", parseBinanceTickers(body));
        return;
      }
      const body = await readJson("https://api.bybit.com/v5/market/tickers?category=spot");
      if (!body) return;
      const book = parseBybitTickers(body);
      put(
        "BYBIT",
        Object.fromEntries(bases.filter((base) => book[base]).map((base) => [base, book[base]!]))
      );
    })
  );
  return out;
}
