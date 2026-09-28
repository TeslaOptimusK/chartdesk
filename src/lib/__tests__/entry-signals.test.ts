import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "@/lib/types";
import {
  collapseEntrySignalsForDisplay,
  detectEntrySignals,
  lastBarHasEntrySignal,
  entrySignalForAlertTarget,
  type EntrySignal,
} from "@/lib/entry-signals";

function synthCandles(n: number): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  const t0 = 1_700_000_000;
  for (let i = 0; i < n; i++) {
    // Dip then recover to force Stoch RSI cross + MACD hist flip in the last third
    let delta = 0;
    if (i < n * 0.4) delta = 0.4;
    else if (i < n * 0.7) delta = -0.9;
    else delta = 1.2;
    const open = price;
    price = Math.max(1, price + delta);
    const close = price;
    const high = Math.max(open, close) + 0.3;
    const low = Math.min(open, close) - 0.3;
    out.push({
      time: t0 + i * 86400,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 10,
    });
  }
  return out;
}

describe("detectEntrySignals", () => {
  it("returns empty for short series", () => {
    assert.equal(detectEntrySignals(synthCandles(10)).length, 0);
  });

  it("emits stoch and/or macd markers on a recovery series", () => {
    const candles = synthCandles(120);
    const signals = detectEntrySignals(candles, { includeChannelBreak: false });
    const kinds = new Set(signals.map((s) => s.kind));
    assert.ok(
      kinds.has("stoch_rsi_cross_up") || kinds.has("macd_hist_flip_up"),
      `expected momentum markers, got ${[...kinds].join(",")}`
    );
    for (const s of signals) {
      assert.ok(s.label.length > 0);
      assert.ok(s.rule.length > 0);
      assert.ok(s.time > 0);
    }
  });

  it("maps alert target entry.confluence", () => {
    const candles = synthCandles(120);
    const signals = detectEntrySignals(candles, { includeChannelBreak: false });
    const conf = signals.filter((s) => s.kind === "confluence_entry");
    if (conf.length) {
      const last = conf[conf.length - 1];
      const trimmed = candles.slice(0, last.barIndex + 1);
      const hit = entrySignalForAlertTarget(trimmed, "entry.confluence");
      assert.ok(hit);
      assert.equal(hit!.kind, "confluence_entry");
    } else {
      assert.equal(
        lastBarHasEntrySignal(candles, "confluence_entry"),
        null
      );
    }
  });
});

function signal(
  barIndex: number,
  kind: EntrySignal["kind"]
): EntrySignal {
  return {
    time: 1_700_000_000 + barIndex * 14_400,
    barIndex,
    kind,
    label: kind,
    price: 100,
    rule: kind,
  };
}

describe("collapseEntrySignalsForDisplay", () => {
  it("keeps the strongest kind on a shared bar", () => {
    const shown = collapseEntrySignalsForDisplay(
      [
        signal(10, "stoch_rsi_cross_up"),
        signal(10, "macd_hist_flip_up"),
        signal(10, "confluence_entry"),
      ],
      { lastBarIndex: 10, maxBars: 20, minGap: 1 }
    );
    assert.equal(shown.length, 1);
    assert.equal(shown[0]?.kind, "confluence_entry");
  });

  it("drops signals outside the recent window", () => {
    const shown = collapseEntrySignalsForDisplay(
      [signal(1, "stoch_rsi_cross_up"), signal(40, "macd_hist_flip_up")],
      { lastBarIndex: 40, maxBars: 20, minGap: 1 }
    );
    assert.deepEqual(
      shown.map((s) => s.barIndex),
      [40]
    );
  });

  it("spaces neighboring bars so arrows do not fence the chart", () => {
    const shown = collapseEntrySignalsForDisplay(
      [
        signal(30, "stoch_rsi_cross_up"),
        signal(31, "macd_hist_flip_up"),
        signal(34, "channel_break_up"),
      ],
      { lastBarIndex: 40, maxBars: 20, minGap: 2 }
    );
    assert.deepEqual(
      shown.map((s) => s.barIndex),
      [31, 34]
    );
  });
});
