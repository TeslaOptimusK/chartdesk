import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { restoreWorkspace } from "@/lib/store";

const known = new Set(["kr_005930", "us_NVDA", "crypto_UPBIT_BTC"]);

describe("workspace restore", () => {
  it("brings back the last symbol, timeframe, indicators, style, and layout", () => {
    assert.deepEqual(
      restoreWorkspace(
        {
          activeSymbolId: "kr_005930",
          secondarySymbolIds: ["us_NVDA", "crypto_UPBIT_BTC"],
          timeframe: "60",
          paneTimeframes: ["60", "15", "D", "W"],
          indicators: ["ema20", "rsi"],
          chartStyle: "heikin_ashi",
          layoutMode: "split2",
          magnet: false,
        },
        known
      ),
      {
        activeSymbolId: "kr_005930",
        secondarySymbolIds: ["us_NVDA", "crypto_UPBIT_BTC"],
        timeframe: "60",
        paneTimeframes: ["60", "15", "D", "W"],
        indicators: ["ema20", "rsi"],
        chartStyle: "heikin_ashi",
        layoutMode: "split2",
        magnet: false,
      }
    );
  });

  it("drops symbols that no longer exist and values that are not valid", () => {
    const restored = restoreWorkspace(
      {
        activeSymbolId: "us_GONE",
        secondarySymbolIds: ["us_GONE", "us_NVDA"],
        timeframe: "7" as never,
        paneTimeframes: ["D", "D"] as never,
        chartStyle: "spiral" as never,
        layoutMode: "split9" as never,
        magnet: "yes" as never,
      },
      known
    );
    assert.deepEqual(restored, { secondarySymbolIds: ["us_NVDA"] });
  });

  it("returns nothing for a missing snapshot", () => {
    assert.deepEqual(restoreWorkspace({}, known), {});
  });
});
