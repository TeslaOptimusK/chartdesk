import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLiveCandle,
  generateMockCandles,
  isAlienPrint,
} from "@/lib/market-data/mock-adapter";
import { alignSeedDrawings } from "@/lib/seed";
import { zonesInsideCandleRange } from "@/lib/easychart/confluence";
import type { Candle, Drawing } from "@/lib/types";
import type { EasyZone } from "@/lib/easychart/types";

function lastClose(symbolId: string, ticker: string, tf: "D" | "1", limit: number) {
  const bars = generateMockCandles({
    symbolId,
    ticker,
    timeframe: tf,
    limit,
  });
  return bars.at(-1)!;
}

describe("mock series alignment", () => {
  it("limit 2 and limit 240 share the same last bar", () => {
    for (const [id, ticker, tf] of [
      ["us_TSLA", "TSLA", "D"],
      ["us_TSLA", "TSLA", "1"],
      ["kr_005930", "005930", "D"],
      ["kr_005930", "005930", "1"],
    ] as const) {
      const short = lastClose(id, ticker, tf, 2);
      const long = lastClose(id, ticker, tf, 240);
      assert.equal(short.time, long.time, `${ticker} ${tf} time`);
      assert.equal(short.open, long.open, `${ticker} ${tf} open`);
      assert.equal(short.close, long.close, `${ticker} ${tf} close`);
    }
  });

  it("bars stay near the symbol base without a one-bar crash", () => {
    const tsla = generateMockCandles({
      symbolId: "us_TSLA",
      ticker: "TSLA",
      timeframe: "D",
      limit: 240,
    });
    const samsung = generateMockCandles({
      symbolId: "kr_005930",
      ticker: "005930",
      timeframe: "D",
      limit: 240,
    });
    for (const c of tsla) {
      assert.ok(c.high >= Math.max(c.open, c.close));
      assert.ok(c.low <= Math.min(c.open, c.close));
      const range = (c.high - c.low) / c.close;
      assert.ok(range < 0.02, `TSLA range ${range}`);
      assert.ok(c.close > 230 && c.close < 270, `TSLA close ${c.close}`);
    }
    for (const c of samsung) {
      assert.equal(c.close, Math.round(c.close));
      assert.equal(c.open, Math.round(c.open));
      assert.ok(c.close > 74000 && c.close < 82000, `KRW close ${c.close}`);
      const range = (c.high - c.low) / c.close;
      assert.ok(range < 0.02, `KRW range ${range}`);
    }
  });

  it("rejects a live close that would paint a crash wick", () => {
    const series: Candle[] = [
      {
        time: 100,
        open: 279.47,
        high: 280.63,
        low: 279.01,
        close: 280.25,
        volume: 1000,
      },
    ];
    const alien: Candle = {
      time: 100,
      open: 250.83,
      high: 251.58,
      low: 250.64,
      close: 251.59,
      volume: 50,
    };
    assert.equal(isAlienPrint(280.25, 251.59), true);
    const next = applyLiveCandle(series, alien);
    assert.equal(next, series);
    assert.equal(next[0]!.close, 280.25);
    assert.equal(next[0]!.open, 279.47);
  });

  it("accepts a small forming-bar nudge and keeps the open", () => {
    const series: Candle[] = [
      {
        time: 100,
        open: 250,
        high: 250.4,
        low: 249.8,
        close: 250.2,
        volume: 1000,
      },
    ];
    const tick: Candle = {
      time: 100,
      open: 250,
      high: 250.5,
      low: 249.8,
      close: 250.35,
      volume: 1200,
    };
    const next = applyLiveCandle(series, tick);
    assert.equal(next[0]!.open, 250);
    assert.equal(next[0]!.close, 250.35);
    assert.ok(next[0]!.high >= 250.5);
  });
});

describe("overlay price alignment", () => {
  it("rebuilds seed drawings that sit outside the visible candles", () => {
    const candles = generateMockCandles({
      symbolId: "kr_005930",
      ticker: "005930",
      timeframe: "D",
      limit: 120,
    });
    const stale: Drawing = {
      id: "draw_seed_fib",
      symbolId: "kr_005930",
      tool: "fibonacci",
      points: [
        { time: candles[40]!.time, price: 120000 },
        { time: candles[90]!.time, price: 121000 },
      ],
      color: "#c084fc",
      text: "데모: 지지 관찰",
      createdAt: "2026-09-16T00:00:00.000Z",
    };
    const aligned = alignSeedDrawings([stale], "kr_005930", candles);
    const fib = aligned.find((d) => d.id === "draw_seed_fib");
    assert.ok(fib);
    const hi = Math.max(...candles.map((c) => c.high));
    const lo = Math.min(...candles.map((c) => c.low));
    for (const p of fib!.points) {
      assert.ok(p.price <= hi * 1.01, `fib ${p.price} above ${hi}`);
      assert.ok(p.price >= lo * 0.99, `fib ${p.price} below ${lo}`);
    }
    const note = aligned.find((d) => d.id === "draw_seed_text");
    assert.equal(note?.text, "데모: 지지 관찰");
    assert.ok(note && note.points[0]!.price <= hi && note.points[0]!.price >= lo);
  });

  it("drops easy zones whose prices are far from the candles", () => {
    const candles = generateMockCandles({
      symbolId: "kr_005930",
      ticker: "005930",
      timeframe: "D",
      limit: 40,
    });
    const hi = Math.max(...candles.map((c) => c.high));
    const zone: EasyZone = {
      id: "fib_stale",
      kind: "fib",
      bias: "bullish",
      priceTop: 121000,
      priceBottom: 120000,
      startTime: candles[0]!.time,
      endTime: candles.at(-1)!.time,
      extendFrom: candles.at(-1)!.time,
      invalidated: false,
      score: 1,
      barIndex: 10,
      htfOverlap: false,
      touched: false,
      fibLevels: [
        { ratio: 0.5, price: 120500 },
      ],
    };
    const onScale: EasyZone = {
      ...zone,
      id: "fib_ok",
      priceTop: hi,
      priceBottom: hi - 10,
      fibLevels: [{ ratio: 0.5, price: hi - 5 }],
      points: undefined,
    };
    const kept = zonesInsideCandleRange([zone, onScale], candles);
    assert.deepEqual(
      kept.map((z) => z.id),
      ["fib_ok"]
    );
  });
});
