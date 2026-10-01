import type { AssetClass, SymbolMeta, WatchlistSection } from "@/lib/types";

export function flattenWatchlist(sections: WatchlistSection[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    for (const id of section.symbolIds) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/** First visit: keep the symbols already on screen, grouped by market. */
export function defaultWatchlistSections(
  symbols: SymbolMeta[],
  watchlist: string[] = []
): WatchlistSection[] {
  const chosen = watchlist.length
    ? symbols.filter((symbol) => watchlist.includes(symbol.id))
    : symbols;
  const rows = chosen.length ? chosen : symbols;
  const take = (asset: AssetClass) =>
    rows.filter((symbol) => symbol.assetClass === asset).map((symbol) => symbol.id);
  const sections: WatchlistSection[] = [];
  const kr = take("kr_stock");
  const us = take("us_stock");
  const crypto = take("crypto");
  if (kr.length) sections.push({ id: "wl_kr", name: "국내", symbolIds: kr });
  if (us.length) sections.push({ id: "wl_us", name: "미국", symbolIds: us });
  if (crypto.length) sections.push({ id: "wl_crypto", name: "암호화폐", symbolIds: crypto });
  if (!sections.length) sections.push({ id: "wl_main", name: "관심", symbolIds: [] });
  return sections;
}

export function normalizeWatchlistSections(
  sections: WatchlistSection[] | undefined,
  symbols: SymbolMeta[],
  watchlist: string[]
): WatchlistSection[] {
  if (!sections?.length) return defaultWatchlistSections(symbols, watchlist);
  const known = new Set(symbols.map((symbol) => symbol.id));
  return sections.map((section) => ({
    id: section.id,
    name: section.name.trim() || "관심",
    symbolIds: section.symbolIds.filter((id) => known.has(id)),
  }));
}

export function symbolMatchesQuery(symbol: SymbolMeta, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const ticker = symbol.ticker.toLowerCase();
  if (ticker === q || ticker.startsWith(q)) return true;
  const hay = [symbol.ticker, symbol.nameKo, symbol.nameEn, symbol.exchange, ...symbol.aliases]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function symbolIdFor(assetClass: AssetClass, ticker: string): string {
  const code = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (assetClass === "kr_stock") return `kr_${code}`;
  if (assetClass === "crypto") return `crypto_${code}`;
  return `us_${code}`;
}
