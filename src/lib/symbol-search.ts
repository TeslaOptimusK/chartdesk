import { readFileSync } from "fs";
import path from "path";
import type { AssetClass, SymbolMeta } from "@/lib/types";

interface DbRow {
  t: string;
  n: string;
  e: string;
  a: AssetClass;
}

let db: DbRow[] | null = null;

function symbolDb(): DbRow[] {
  if (db) return db;
  const file = path.join(process.cwd(), "data", "symbol-db.json");
  db = JSON.parse(readFileSync(file, "utf8")) as DbRow[];
  return db;
}

/** Local ticker and name search. Two characters are enough for a name match. */
export function searchSymbolDb(query: string, limit = 12): SymbolSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const qUpper = q.toUpperCase();
  const scored: { row: DbRow; score: number }[] = [];
  for (const row of symbolDb()) {
    const ticker = row.t.toUpperCase();
    const name = row.n.toLowerCase();
    let score = 0;
    if (ticker === qUpper) score = 100;
    else if (ticker.startsWith(qUpper)) score = 80;
    else if (name.startsWith(q)) score = 60;
    else if (name.includes(q)) score = 40;
    else continue;
    scored.push({ row, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score || a.row.n.length - b.row.n.length || a.row.t.localeCompare(b.row.t)
  );
  return scored.slice(0, limit).map((hit) => ({
    ticker: hit.row.t,
    name: hit.row.n,
    exchange: hit.row.e,
    assetClass: hit.row.a,
  }));
}

export interface SymbolSuggestion {
  ticker: string;
  name: string;
  exchange: string;
  assetClass: AssetClass;
}

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  quoteType?: string;
}

function mapQuote(row: YahooQuote): SymbolSuggestion | null {
  const raw = row.symbol?.trim().toUpperCase();
  const kind = (row.quoteType ?? "").toUpperCase();
  if (!raw || !["EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY"].includes(kind)) return null;
  const name = row.shortname || row.longname || raw;
  if (kind === "CRYPTOCURRENCY") {
    const base = raw.replace(/-USD$/, "").replace(/-KRW$/, "");
    return {
      ticker: `${base}USDT`,
      name,
      exchange: "BINANCE",
      assetClass: "crypto",
    };
  }
  if (raw.endsWith(".KS") || raw.endsWith(".KQ")) {
    return {
      ticker: raw.slice(0, -3),
      name,
      exchange: "KRX",
      assetClass: "kr_stock",
    };
  }
  const venue = (row.exchDisp ?? "").toUpperCase();
  const exchange = venue.includes("NYSE") || venue.includes("NYQ") ? "NYSE" : "NASDAQ";
  return { ticker: raw.replace(/^\^/, ""), name, exchange, assetClass: "us_stock" };
}

/** Yahoo symbol search for names that are not already in the local catalog. */
export async function searchYahooSymbols(
  query: string,
  existing: SymbolMeta[]
): Promise<SymbolSuggestion[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const known = new Set(existing.map((symbol) => symbol.ticker.toUpperCase()));
  try {
    const url = new URL("https://query2.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", q);
    url.searchParams.set("quotesCount", "8");
    url.searchParams.set("newsCount", "0");
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ChartDesk/1.0)",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { quotes?: YahooQuote[] };
    const out: SymbolSuggestion[] = [];
    for (const row of json.quotes ?? []) {
      const hit = mapQuote(row);
      if (!hit || known.has(hit.ticker) || out.some((item) => item.ticker === hit.ticker)) continue;
      out.push(hit);
      if (out.length >= 6) break;
    }
    return out;
  } catch {
    return [];
  }
}
