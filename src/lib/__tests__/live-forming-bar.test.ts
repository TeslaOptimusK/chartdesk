import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFormingBarSubscriber } from "@/lib/market-data/mock-adapter";
import type { Candle } from "@/lib/types";

describe("createFormingBarSubscriber", () => {
  it("emits forming-bar OHLC that changes within ~1s on 1m", async () => {
    const seed: Candle = {
      time: Math.floor(Date.now() / 1000) - (Math.floor(Date.now() / 1000) % 60),
      open: 100,
      high: 100.5,
      low: 99.5,
      close: 100.2,
      volume: 1000,
    };
    const ticks: Candle[] = [];
    const unsub = createFormingBarSubscriber(
      {
        symbolId: "sym_test",
        ticker: "TEST",
        timeframe: "1",
        limit: 2,
      },
      (c) => ticks.push(c),
      async () => [seed]
    );

    await new Promise((r) => setTimeout(r, 50));
    assert.ok(ticks.length >= 1, "seed emit");
    const first = ticks[0]!;
    await new Promise((r) => setTimeout(r, 1100));
    unsub();
    assert.ok(ticks.length >= 2, `expected >=2 ticks, got ${ticks.length}`);
    const last = ticks[ticks.length - 1]!;
    assert.equal(last.time, first.time, "same forming bar time");
    const moved =
      last.close !== first.close ||
      last.high !== first.high ||
      last.low !== first.low ||
      last.volume !== first.volume;
    assert.ok(moved, `OHLC should move: first=${JSON.stringify(first)} last=${JSON.stringify(last)}`);
    assert.ok(last.high >= Math.max(last.open, last.close));
    assert.ok(last.low <= Math.min(last.open, last.close));
  });
});
