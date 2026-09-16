import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Candle } from "../../types";
import { orderBlockBodyBox, detectOrderBlocks } from "../order-block";
import {
  detectFairValueGaps,
  passesMiddleSizeFilter,
} from "../fvg";
import { bodyHigh, bodyLow } from "../types";

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

describe("Order Block body-only", () => {
  it("box uses body high/low only — never wicks", () => {
    const candle = c(1, 100, 120, 80, 105); // wick 120/80, body 100–105
    const box = orderBlockBodyBox(candle);
    assert.equal(box.top, 105);
    assert.equal(box.bottom, 100);
    assert.ok(box.top < candle.high);
    assert.ok(box.bottom > candle.low);
    assert.equal(box.top, bodyHigh(candle));
    assert.equal(box.bottom, bodyLow(candle));
  });

  it("detectOrderBlocks zones never span into wick beyond body", () => {
    const candles: Candle[] = [
      c(1, 100, 102, 99, 101),
      c(2, 101, 103, 90, 92), // bearish OB candidate — long lower wick to 90
      c(3, 92, 120, 91, 118), // strong bullish impulse ~2x+ body
      c(4, 118, 122, 116, 120),
    ];
    const zones = detectOrderBlocks(candles, { minBodyRatio: 2 });
    assert.ok(zones.length >= 1);
    const z = zones.find((x) => x.bias === "bullish");
    assert.ok(z);
    // Body of candle 2: open 101 close 92 → top 101 bottom 92
    assert.equal(z!.priceTop, 101);
    assert.equal(z!.priceBottom, 92);
    // Must NOT include wick low 90 in the box
    assert.ok(z!.priceBottom > 90);
    assert.ok(z!.stopPrice === 90 || z!.stopPrice === 91);
  });

  it("excludes doji as OB source", () => {
    const candles: Candle[] = [
      c(1, 100, 101, 99, 100.5),
      c(2, 100, 110, 90, 100.1), // doji-ish tiny body huge wick
      c(3, 100, 130, 99, 128),
      c(4, 128, 130, 126, 129),
    ];
    const zones = detectOrderBlocks(candles, { minBodyRatio: 2 });
    assert.equal(
      zones.filter((z) => z.barIndex === 1).length,
      0,
      "doji index must not become OB"
    );
  });
});

describe("FVG size filter", () => {
  it("rejects similar-size three candles even if geometric gap exists", () => {
    // Geometric bullish gap (high1 < low3) but bodies ~same size
    const a = c(10, 100, 102, 99, 101); // body 1, high 102
    const b = c(11, 101, 104, 100.5, 102.2); // body 1.2
    const d = c(12, 105, 107, 104.5, 106); // body 1, low 104.5 > 102
    assert.equal(passesMiddleSizeFilter(a, b, d, 2, 8), false);
    const fvgs = detectFairValueGaps([a, b, d], { fvgMiddleMinRatio: 2 });
    assert.equal(fvgs.length, 0);
  });

  it("accepts FVG when middle body is ≥2× neighbors", () => {
    const c1 = c(1, 100, 101, 99.5, 100.5); // body 0.5, high 101
    const c2 = c(2, 100.5, 108, 100, 107); // body 6.5 (~13×)
    const c3 = c(3, 107.5, 109, 107.2, 108); // body 0.5, low 107.2 > 101
    assert.equal(passesMiddleSizeFilter(c1, c2, c3, 2, 20), true);
    const fvgs = detectFairValueGaps([c1, c2, c3, c(4, 108, 109, 107, 108.5)], {
      fvgMiddleMinRatio: 2,
      fvgMiddleMaxRatio: 20,
      maxAgeBars: 100,
    });
    assert.ok(fvgs.some((z) => z.bias === "bullish"));
    const z = fvgs.find((x) => x.bias === "bullish")!;
    assert.equal(z.priceBottom, 101);
    assert.equal(z.priceTop, 107.2);
  });
});
