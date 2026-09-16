import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stochasticRsi } from "@/lib/indicators-extra";
import type { Candle } from "@/lib/types";

function candle(i: number, close: number): Candle {
  const base = 100 + Math.sin(i / 5) * 8 + close * 0.01;
  return {
    time: 1_700_000_000 + i * 3600,
    open: base,
    high: base + 1.5,
    low: base - 1.5,
    close: base + (i % 3 === 0 ? 0.8 : -0.4),
    volume: 1000 + i,
  };
}

describe("stochasticRsi", () => {
  it("returns nulls until RSI+stoch windows warm up, then 0–100 values", () => {
    const candles = Array.from({ length: 80 }, (_, i) => candle(i, i));
    const { k, d } = stochasticRsi(candles);
    assert.equal(k.length, candles.length);
    assert.equal(d.length, candles.length);
    const firstValid = k.findIndex((v) => v != null);
    assert.ok(firstValid > 20, `expected warm-up, got ${firstValid}`);
    for (let i = firstValid; i < k.length; i++) {
      if (k[i] == null) continue;
      assert.ok(k[i]! >= 0 && k[i]! <= 100);
      if (d[i] != null) assert.ok(d[i]! >= 0 && d[i]! <= 100);
    }
  });
});
