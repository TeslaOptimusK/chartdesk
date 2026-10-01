import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SymbolMeta } from "@/lib/types";
import { searchSymbolDb } from "@/lib/symbol-search";
import {
  defaultWatchlistSections,
  flattenWatchlist,
  symbolMatchesQuery,
} from "@/lib/watchlist";

const symbols: SymbolMeta[] = [
  {
    id: "kr_005930",
    ticker: "005930",
    exchange: "KRX",
    nameKo: "삼성전자",
    nameEn: "Samsung Electronics",
    assetClass: "kr_stock",
    aliases: ["삼전"],
  },
  {
    id: "us_TSLA",
    ticker: "TSLA",
    exchange: "NASDAQ",
    nameKo: "테슬라",
    nameEn: "Tesla",
    assetClass: "us_stock",
    aliases: ["Tesla"],
  },
];

describe("watchlist sections", () => {
  it("groups symbols by market and flattens without duplicates", () => {
    const sections = defaultWatchlistSections(symbols, []);
    assert.deepEqual(
      sections.map((section) => section.name),
      ["국내", "미국"]
    );
    assert.deepEqual(flattenWatchlist(sections), ["kr_005930", "us_TSLA"]);
  });

  it("lists the same coin on each exchange", () => {
    const hits = searchSymbolDb("솔라");
    const sol = hits.filter((hit) => hit.ticker === "SOL" && hit.assetClass === "crypto");
    assert.ok(sol.some((hit) => hit.exchange === "UPBIT" && hit.name.includes("솔라나")));
    assert.ok(sol.some((hit) => hit.exchange === "BINANCE"));
    const bitcoin = searchSymbolDb("비트").filter((hit) => hit.ticker === "BTC");
    assert.ok(bitcoin.some((hit) => hit.exchange === "UPBIT"));
    assert.ok(bitcoin.some((hit) => hit.exchange === "BITHUMB"));
  });

  it("finds Pharma Research from a two-character name", () => {
    const hits = searchSymbolDb("파마");
    assert.ok(hits.some((hit) => hit.ticker === "214450" && hit.name === "파마리서치"));
    const exact = searchSymbolDb("파마리서치");
    assert.equal(exact[0]?.ticker, "214450");
    assert.equal(searchSymbolDb("파").length, 0);
  });

  it("matches a ticker prefix and a Korean name", () => {
    assert.equal(symbolMatchesQuery(symbols[0]!, "삼전"), true);
    assert.equal(symbolMatchesQuery(symbols[1]!, "ts"), true);
    assert.equal(symbolMatchesQuery(symbols[1]!, "삼성"), false);
  });
});
