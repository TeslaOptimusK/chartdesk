import { NextResponse } from "next/server";
import { fetchYahooSessionSnapshot } from "@/lib/market-data/yahoo";
import {
  barIsToday,
  clockQuotePhase,
  mergeQuotePhase,
  resolveSessionQuote,
  type SessionQuoteView,
} from "@/lib/session-quote";
import { readStore } from "@/lib/storage";
import type { AssetClass } from "@/lib/types";

export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; quote: SessionQuoteView }>();

function timeZoneFor(assetClass: AssetClass | undefined, exchange: string | undefined): string {
  const ex = (exchange ?? "").toUpperCase();
  if (
    assetClass === "kr_stock" ||
    ex === "KRX" ||
    ex === "KOSPI" ||
    ex === "KOSDAQ"
  ) {
    return "Asia/Seoul";
  }
  return "America/New_York";
}

async function quoteFor(symbol: {
  id: string;
  ticker: string;
  exchange: string;
  assetClass: AssetClass;
}): Promise<SessionQuoteView | null> {
  const hit = cache.get(symbol.id);
  if (hit && Date.now() - hit.at < 20_000) return hit.quote;
  const snap = await fetchYahooSessionSnapshot(
    symbol.ticker,
    symbol.exchange,
    symbol.assetClass
  );
  if (!snap || snap.closes.length < 2) return null;
  const now = new Date();
  const zone = timeZoneFor(symbol.assetClass, symbol.exchange);
  const phase = mergeQuotePhase(
    clockQuotePhase(symbol.assetClass, symbol.exchange, now),
    snap.marketState
  );
  const last = snap.closes[snap.closes.length - 1]!;
  const view = resolveSessionQuote({
    phase,
    dailyCloses: snap.closes.map((bar) => bar.close),
    lastBarIsToday: barIsToday(last.time, now, zone),
    livePrice: snap.livePrice,
    prePrice: phase === "pre" ? snap.prePrice : null,
  });
  if (!view) return null;
  cache.set(symbol.id, { at: Date.now(), quote: view });
  return view;
}

export async function GET(req: Request) {
  const ids = [
    ...new Set(
      (new URL(req.url).searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ].slice(0, 40);
  if (!ids.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  const store = await readStore();
  const quotes: Record<string, SessionQuoteView> = {};
  await Promise.all(
    ids.map(async (id) => {
      const symbol = store.symbols.find((row) => row.id === id);
      if (!symbol) return;
      const quote = await quoteFor(symbol);
      if (quote) quotes[id] = quote;
    })
  );
  return NextResponse.json({ quotes });
}
