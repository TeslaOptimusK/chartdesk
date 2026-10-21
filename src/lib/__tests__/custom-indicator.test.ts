import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CUSTOM_INDICATOR_EXAMPLE,
  customIndicatorError,
  runCustomIndicator,
} from "@/lib/custom-indicator";
import type { Candle } from "@/lib/types";

const candles: Candle[] = [1, 2, 3, 4, 5, 6].map((close, i) => ({
  time: i * 60,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
}));

describe("custom indicator", () => {
  it("runs the example script", () => {
    assert.equal(customIndicatorError(CUSTOM_INDICATOR_EXAMPLE), null);
    assert.deepEqual(runCustomIndicator(CUSTOM_INDICATOR_EXAMPLE, candles), [
      null,
      null,
      null,
      null,
      null,
      4,
    ]);
  });

  it("returns empty values for a half-typed script instead of throwing", () => {
    const partial = "return candles.map((c";
    assert.doesNotThrow(() => runCustomIndicator(partial, candles));
    assert.deepEqual(runCustomIndicator(partial, candles), candles.map(() => null));
    assert.match(customIndicatorError(partial) ?? "", /./);
  });

  it("treats an empty script as no indicator", () => {
    assert.equal(customIndicatorError("   "), null);
    assert.deepEqual(runCustomIndicator("", candles), candles.map(() => null));
  });
});
