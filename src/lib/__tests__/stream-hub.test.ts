import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_QUOTE_STREAMS,
  createStreamClient,
  type StreamMessage,
} from "@/lib/market-data/stream-hub";
import type { CandleQuery, MarketDataAdapter } from "@/lib/market-data/types";
import type { Candle, SymbolMeta } from "@/lib/types";

function bar(time: number, close: number): Candle {
  return { time, open: close - 1, high: close + 1, low: close - 2, close, volume: 10 };
}

function fakeAdapter() {
  const listeners = new Map<string, Set<(candle: Candle) => void>>();
  const adapter: MarketDataAdapter = {
    id: "fake",
    label: "fake",
    mode: "mock",
    async getCandles() {
      return [bar(60, 100), bar(120, 101)];
    },
    subscribe(query: CandleQuery, onCandle) {
      const key = `${query.symbolId}|${query.timeframe}`;
      const set = listeners.get(key) ?? new Set();
      set.add(onCandle);
      listeners.set(key, set);
      return () => {
        set.delete(onCandle);
        if (!set.size) listeners.delete(key);
      };
    },
  };
  const emit = (key: string, candle: Candle) => {
    for (const fn of listeners.get(key) ?? []) fn(candle);
  };
  return { adapter, listeners, emit };
}

const symbols = new Map<string, SymbolMeta>(
  ["us_NVDA", "kr_005930", "us_TSLA"].map((id) => [
    id,
    { id, ticker: id.split("_")[1]!, exchange: "X", nameKo: id, nameEn: id, assetClass: "us_stock", aliases: [] },
  ])
);
const lookup = (id: string) => symbols.get(id);
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("shared market stream", () => {
  it("carries several chart panes and the quotes on one stream", async () => {
    const { adapter, emit } = fakeAdapter();
    const sent: StreamMessage[] = [];
    const client = createStreamClient({ adapter, send: (m) => sent.push(m) });
    client.update(
      {
        charts: [
          { symbolId: "us_NVDA", tf: "1" },
          { symbolId: "kr_005930", tf: "tick" },
        ],
        quotes: { ids: ["us_TSLA"], tf: "1" },
      },
      lookup
    );
    await tick();
    emit("us_NVDA|1", bar(180, 105));
    emit("kr_005930|1", bar(180, 70_000));

    assert.deepEqual(
      sent.filter((m) => m.type === "candle").map((m) => m.type === "candle" && `${m.symbolId}|${m.tf}`),
      ["us_NVDA|1", "kr_005930|tick"]
    );
    const seed = sent.find((m) => m.type === "quote");
    assert.ok(seed && seed.type === "quote" && seed.symbolId === "us_TSLA" && seed.prevClose === 100);
  });

  it("changing one pane leaves the other subscriptions running", () => {
    const { adapter, listeners } = fakeAdapter();
    const client = createStreamClient({ adapter, send: () => undefined });
    client.update({ charts: [{ symbolId: "us_NVDA", tf: "D" }, { symbolId: "us_TSLA", tf: "D" }], quotes: null }, lookup);
    const tslaListener = [...listeners.get("us_TSLA|D")!][0];

    client.update({ charts: [{ symbolId: "kr_005930", tf: "D" }, { symbolId: "us_TSLA", tf: "D" }], quotes: null }, lookup);
    assert.equal(listeners.has("us_NVDA|D"), false);
    assert.equal(listeners.has("kr_005930|D"), true);
    assert.equal([...listeners.get("us_TSLA|D")!][0], tslaListener);
  });

  it("marks a new bar as a roll and resets the change base", () => {
    const { adapter, emit } = fakeAdapter();
    const sent: StreamMessage[] = [];
    const client = createStreamClient({ adapter, send: (m) => sent.push(m) });
    client.update({ charts: [], quotes: { ids: ["us_NVDA"], tf: "1" } }, lookup);
    emit("us_NVDA|1", { ...bar(60, 100), open: 99 });
    emit("us_NVDA|1", { ...bar(120, 102), open: 101 });
    const live = sent.filter((m) => m.type === "quote");
    assert.deepEqual(
      live.map((m) => m.type === "quote" && [m.prevClose, m.barRoll]),
      [
        [99, false],
        [101, true],
      ]
    );
  });

  it("skips unknown symbols, caps the quote list, and stops everything on close", () => {
    const { adapter, listeners } = fakeAdapter();
    const many = new Map<string, SymbolMeta>(
      Array.from({ length: MAX_QUOTE_STREAMS + 5 }, (_, i) => [
        `us_S${i}`,
        { id: `us_S${i}`, ticker: `S${i}`, exchange: "X", nameKo: "", nameEn: "", assetClass: "us_stock", aliases: [] },
      ])
    );
    const client = createStreamClient({ adapter, send: () => undefined });
    client.update(
      {
        charts: [{ symbolId: "us_GONE", tf: "D" }],
        quotes: { ids: [...many.keys()], tf: "1" },
      },
      (id) => many.get(id)
    );
    assert.equal(listeners.size, MAX_QUOTE_STREAMS);
    client.close();
    assert.equal(listeners.size, 0);
  });
});
