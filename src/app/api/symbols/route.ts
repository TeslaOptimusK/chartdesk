import { NextResponse } from "next/server";
import { addSymbol, readStore, updateWatchlist, updateWatchlistSections } from "@/lib/storage";
import { searchSymbolDb, searchYahooSymbols } from "@/lib/symbol-search";
import type { AssetClass, WatchlistSection } from "@/lib/types";
import { symbolMatchesQuery } from "@/lib/watchlist";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const store = await readStore();
  const symbols = !q ? store.symbols : store.symbols.filter((s) => symbolMatchesQuery(s, q));
  const known = new Set(
    store.symbols.map((s) => `${s.exchange.toUpperCase()}|${s.ticker.toUpperCase()}`)
  );
  const catalog =
    q.length >= 2
      ? searchSymbolDb(q).filter((hit) => !known.has(`${hit.exchange.toUpperCase()}|${hit.ticker.toUpperCase()}`))
      : [];
  const yahoo =
    q.length >= 2 && catalog.length < 8 ? await searchYahooSymbols(q, store.symbols) : [];
  const suggestions = [
    ...catalog,
    ...yahoo.filter((hit) => !known.has(`${hit.exchange.toUpperCase()}|${hit.ticker.toUpperCase()}`)),
  ].slice(0, 12);
  return NextResponse.json({
    symbols,
    suggestions,
    watchlist: store.watchlist,
    watchlistSections: store.watchlistSections ?? [],
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    ticker?: string;
    name?: string;
    exchange?: string;
    assetClass?: AssetClass;
  };
  const ticker = body.ticker?.trim();
  if (!ticker || !body.assetClass || !body.exchange) {
    return NextResponse.json({ error: "ticker, exchange, assetClass required" }, { status: 400 });
  }
  const name = body.name?.trim() || ticker;
  const symbol = await addSymbol({
    ticker,
    exchange: body.exchange,
    nameKo: name,
    nameEn: name,
    assetClass: body.assetClass,
  });
  return NextResponse.json({ symbol });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    watchlist?: string[];
    watchlistSections?: WatchlistSection[];
  };
  if (Array.isArray(body.watchlistSections)) {
    const store = await updateWatchlistSections(body.watchlistSections);
    return NextResponse.json({
      watchlist: store.watchlist,
      watchlistSections: store.watchlistSections ?? [],
    });
  }
  if (!Array.isArray(body.watchlist)) {
    return NextResponse.json({ error: "watchlist[] required" }, { status: 400 });
  }
  const store = await updateWatchlist(body.watchlist);
  return NextResponse.json({ watchlist: store.watchlist });
}
