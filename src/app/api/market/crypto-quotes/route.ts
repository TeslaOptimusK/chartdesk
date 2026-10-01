import { NextResponse } from "next/server";
import { cryptoVenue, fetchVenueBooks } from "@/lib/crypto-venue";
import { readStore } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ids = [
    ...new Set(
      (new URL(req.url).searchParams.get("ids") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ].slice(0, 80);
  if (!ids.length) return NextResponse.json({ quotes: {} });
  const store = await readStore();
  const items = ids
    .map((id) => store.symbols.find((symbol) => symbol.id === id))
    .filter((symbol): symbol is NonNullable<typeof symbol> => Boolean(symbol))
    .filter((symbol) => symbol.assetClass === "crypto" && cryptoVenue(symbol.exchange));
  const books = await fetchVenueBooks(
    items.map((symbol) => ({ ticker: symbol.ticker, exchange: symbol.exchange }))
  );
  const quotes: Record<string, { price: number; changePct: number; ccy: "KRW" | "USDT" }> = {};
  for (const symbol of items) {
    const venue = cryptoVenue(symbol.exchange);
    const base = symbol.ticker.toUpperCase().replace(/USDT$/, "");
    const quote = venue ? books[`${venue}|${base}`] : undefined;
    if (quote) quotes[symbol.id] = quote;
  }
  return NextResponse.json({ quotes });
}
