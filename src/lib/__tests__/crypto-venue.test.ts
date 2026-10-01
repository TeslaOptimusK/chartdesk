import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseBinanceTickers,
  parseUpbitTickers,
  venueMarket,
} from "@/lib/crypto-venue";

describe("crypto venue quotes", () => {
  it("builds the won market on Upbit and the tether market on Binance", () => {
    assert.equal(venueMarket("UPBIT", "SOL"), "KRW-SOL");
    assert.equal(venueMarket("BINANCE", "SOL"), "SOLUSDT");
    assert.equal(venueMarket("BITHUMB", "BTC"), "BTC_KRW");
  });

  it("keeps Upbit and Binance prices in their own units", () => {
    const upbit = parseUpbitTickers([
      { market: "KRW-BTC", trade_price: 162_000_000, signed_change_rate: 0.012 },
    ]);
    const binance = parseBinanceTickers([
      { symbol: "BTCUSDT", lastPrice: "118000", priceChangePercent: "1.1" },
    ]);
    assert.equal(upbit.BTC?.ccy, "KRW");
    assert.equal(upbit.BTC?.price, 162_000_000);
    assert.equal(binance.BTC?.ccy, "USDT");
    assert.equal(binance.BTC?.price, 118000);
    assert.notEqual(upbit.BTC?.price, binance.BTC?.price);
  });
});
