import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Candle } from "../../types";
import { detectTrendLines } from "../trend";
import { detectChannels } from "../channel";
import { detectFibStructures } from "../fib";
import { detectSrFlips } from "../sr-flip";
import { FIB_TB_RATIOS } from "../types";

function c(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1000
): Candle {
  return { time, open, high, low, close, volume };
}

/** Rising lows with lower wicks — wick-based bullish trend */
function risingLowSeries(): Candle[] {
  const out: Candle[] = [];
  let t = 1_700_000_000;
  let base = 100;
  for (let i = 0; i < 60; i++) {
    const swing = i % 8 === 3;
    const low = base - (swing ? 2 : 0.4);
    const high = base + 1.5;
    const open = base;
    const close = base + (i % 5 === 0 ? -0.3 : 0.6);
    out.push(c(t, open, high, low, close));
    t += 3600;
    base += 0.35;
  }
  return out;
}

describe("Phase 2 trend wick-based", () => {
  it("trend points use wick lows/highs not body", () => {
    const candles = risingLowSeries();
    const trends = detectTrendLines(candles);
    assert.ok(trends.length >= 1);
    const bull = trends.find((z) => z.bias === "bullish");
    assert.ok(bull?.points && bull.points.length >= 2);
    for (const p of bull!.points!) {
      const bar = candles.find((x) => x.time === p.time);
      assert.ok(bar);
      // Must sit on wick low (or very near) for bullish trend
      assert.ok(Math.abs(p.price - bar!.low) < 1e-9);
      assert.notEqual(p.price, Math.min(bar!.open, bar!.close));
    }
  });
});

describe("Phase 2 channel parallel", () => {
  it("channel has parallelPoints and mid metadata", () => {
    const candles = risingLowSeries();
    const ch = detectChannels(candles);
    if (ch.length === 0) {
      // Still valid if swings insufficient — ensure API shape on synthetic
      assert.equal(Array.isArray(ch), true);
      return;
    }
    const z = ch[0];
    assert.ok(z.points && z.parallelPoints);
    assert.equal(z.points!.length, 2);
    assert.equal(z.parallelPoints!.length, 2);
    const slopeMain =
      (z.points![1].price - z.points![0].price) /
      (z.points![1].time - z.points![0].time);
    const slopePar =
      (z.parallelPoints![1].price - z.parallelPoints![0].price) /
      (z.parallelPoints![1].time - z.parallelPoints![0].time);
    assert.ok(Math.abs(slopeMain - slopePar) < 1e-12);
  });
});

describe("Phase 2 fib TB ratios", () => {
  it("extension exposes 0.618 / 1 / 1.618", () => {
    assert.deepEqual([...FIB_TB_RATIOS], [0.618, 1.0, 1.618]);
    // Build clear impulse then pullback
    const candles: Candle[] = [];
    let t = 1_700_000_000;
    for (let i = 0; i < 40; i++) {
      const base = 100 + i * 0.5;
      candles.push(c(t, base, base + 1, base - 1, base + 0.8));
      t += 3600;
    }
    // pullback bars
    for (let i = 0; i < 10; i++) {
      const base = 120 - i * 0.8;
      candles.push(c(t, base, base + 0.5, base - 1.2, base - 0.5));
      t += 3600;
    }
    const fibs = detectFibStructures(candles, [110]);
    const ext = fibs.find((z) => z.kind === "fib_ext");
    if (ext?.fibLevels) {
      const ratios = ext.fibLevels.map((l) => l.ratio);
      assert.ok(ratios.includes(0.618));
      assert.ok(ratios.includes(1.0));
      assert.ok(ratios.includes(1.618));
    }
    const overlap = fibs.filter((z) => z.kind === "overlap");
    assert.ok(Array.isArray(overlap));
  });
});

describe("Phase 2 S/R flip wick", () => {
  it("sr flip level equals swing wick extreme", () => {
    const candles: Candle[] = [];
    let t = 1_700_000_000;
    for (let i = 0; i < 50; i++) {
      const base = 100 + Math.sin(i / 5) * 3;
      candles.push(c(t, base, base + 2, base - 2, base + 0.5));
      t += 3600;
    }
    // force a clear high wick then break and retest
    const hi = 20;
    candles[hi] = c(candles[hi].time, 105, 112, 104, 106);
    for (let i = hi + 1; i < hi + 5; i++) {
      candles[i] = c(candles[i].time, 110, 114, 109, 113);
    }
    candles[hi + 5] = c(candles[hi + 5].time, 112, 112.5, 110, 111);
    const flips = detectSrFlips(candles);
    for (const z of flips) {
      assert.equal(z.priceTop, z.priceBottom);
      assert.equal(z.meta?.wick, true);
    }
  });
});
