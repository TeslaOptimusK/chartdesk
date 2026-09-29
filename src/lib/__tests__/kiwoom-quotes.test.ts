import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  alignBarTime,
  buildLoginMessage,
  candlesFromChartBody,
  chartQuerySpec,
  foldTickIntoBar,
  kstYmdHmsToEpoch,
  mergeSeedBar,
  parseRealTicks,
  parseUsRealTicks,
  toKiwoomCode,
  toKiwoomUs,
  buildUsRegMessage,
} from "@/lib/kiwoom/quote-protocol";
import { createQuoteHub, type KiwoomSocket } from "@/lib/kiwoom/quote-hub";
import {
  fetchKiwoomCandles,
  resetKiwoomRestForTests,
  setKiwoomRequestGapForTests,
} from "@/lib/kiwoom/quote-rest";
import {
  KiwoomRoutedMarketDataAdapter,
  resetKiwoomBarSessionsForTests,
} from "@/lib/market-data/kiwoom-adapter";
import type { MarketDataAdapter } from "@/lib/market-data/types";

const NOW_MS = (kstYmdHmsToEpoch("20260928090200") ?? 0) * 1000;

class FakeSocket implements KiwoomSocket {
  sent: string[] = [];
  private handlers = new Map<string, Array<(ev: { data?: unknown }) => void>>();
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.fire("close");
  }
  addEventListener(type: string, listener: (ev: { data?: unknown }) => void) {
    const list = this.handlers.get(type) ?? [];
    list.push(listener);
    this.handlers.set(type, list);
  }
  fire(type: string, data?: unknown) {
    for (const fn of this.handlers.get(type) ?? []) fn({ data });
  }
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("kiwoom quote protocol", () => {
  it("maps only domestic 6-digit codes", () => {
    assert.equal(toKiwoomCode("005930", "KRX", "kr_stock"), "005930");
    assert.equal(toKiwoomCode("TSLA", "NASDAQ", "us_stock"), null);
    assert.equal(toKiwoomCode("BTCUSDT", undefined, "crypto"), null);
    assert.equal(toKiwoomCode("005930", "NASDAQ", "us_stock"), null);
  });

  it("maps US names onto the FE feed and reads the last trade", () => {
    assert.deepEqual(toKiwoomUs("tsla", "NASDAQ", "us_stock"), {
      jmcode: "TSLA",
      stex: "ND",
    });
    assert.equal(toKiwoomUs("TSLA", "NYSE", "us_stock")?.stex, "NY");
    assert.equal(toKiwoomUs("005930", "KRX", "kr_stock"), null);
    const nowSec = Math.floor(NOW_MS / 1000);
    const ticks = parseUsRealTicks(
      {
        trnm: "REAL",
        data: [
          {
            type: "FE",
            item: { jmcode: "TSLA", stex_tp: "ND" },
            values: { "10": "372.11", "15": "4", "20": "213015" },
          },
        ],
      },
      nowSec
    );
    assert.equal(ticks.length, 1);
    assert.equal(ticks[0]!.code, "TSLA");
    assert.equal(ticks[0]!.price, 372.11);
    const reg = JSON.parse(
      buildUsRegMessage(["TSLA"], "1", new Map([["TSLA", "ND"]]))
    ) as { data: Array<{ type: string[]; item: Array<{ jmcode: string; stex_tp: string }> }> };
    assert.deepEqual(reg.data[0]!.type, ["FE"]);
    assert.deepEqual(reg.data[0]!.item[0], { jmcode: "TSLA", stex_tp: "ND" });
  });

  it("parses a 0B trade and folds it into the 1-minute bar", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    const ticks = parseRealTicks(
      {
        trnm: "REAL",
        data: [
          {
            type: "0B",
            item: "A005930",
            values: { "10": "+74800", "15": "12", "13": "1000", "20": "090130" },
          },
        ],
      },
      nowSec
    );
    assert.equal(ticks.length, 1);
    assert.equal(ticks[0]!.code, "005930");
    assert.equal(ticks[0]!.price, 74800);
    assert.equal(ticks[0]!.epochSec, kstYmdHmsToEpoch("20260928090130"));
    const bar = foldTickIntoBar(null, ticks[0]!, "1");
    assert.equal(bar.time, alignBarTime(ticks[0]!.epochSec, "1"));
    assert.equal(bar.open, 74800);
    const next = foldTickIntoBar(
      bar,
      { ...ticks[0]!, price: 74900, tickVolume: 3, epochSec: ticks[0]!.epochSec + 10 },
      "1"
    );
    assert.equal(next.time, bar.time);
    assert.equal(next.open, 74800);
    assert.equal(next.high, 74900);
    assert.equal(next.close, 74900);
    assert.equal(next.volume, 15);
  });

  it("turns newest-first minute rows into ascending candles", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    const bars = candlesFromChartBody(
      {
        stk_min_pole_chart_qry: [
          {
            cur_prc: "+74800",
            open_pric: "74700",
            high_pric: "+74900",
            low_pric: "74600",
            trde_qty: "10",
            cntr_tm: "20260928090200",
          },
          {
            cur_prc: "74000",
            open_pric: "73900",
            high_pric: "74100",
            low_pric: "73800",
            trde_qty: "8",
            cntr_tm: "20260928090100",
          },
        ],
      },
      "1",
      10,
      nowSec
    );
    assert.equal(bars.length, 2);
    assert.ok(bars[0]!.time < bars[1]!.time);
    assert.equal(bars[1]!.close, 74800);
    assert.equal(bars[0]!.volume, 8);
  });

  it("keeps the seed open when a tick lands first", () => {
    const tickBar = {
      time: 100,
      open: 10,
      high: 12,
      low: 10,
      close: 12,
      volume: 1,
    };
    const seed = {
      time: 100,
      open: 9,
      high: 11,
      low: 8,
      close: 11,
      volume: 50,
    };
    const merged = mergeSeedBar(seed, tickBar);
    assert.equal(merged?.open, 9);
    assert.equal(merged?.close, 12);
    assert.equal(merged?.high, 12);
    assert.equal(merged?.low, 8);
    assert.equal(merged?.volume, 50);
  });

  it("requests minute and daily chart TRs", () => {
    const nowSec = Math.floor(NOW_MS / 1000);
    const minute = chartQuerySpec("5", "005930", nowSec);
    assert.equal(minute.apiId, "ka10080");
    assert.equal(minute.body.tic_scope, "5");
    const daily = chartQuerySpec("D", "005930", nowSec);
    assert.equal(daily.apiId, "ka10081");
    assert.equal(daily.body.base_dt, "20260928");
  });
});

describe("kiwoom quote hub", () => {
  it("logs in, registers 0B, echoes PING, and parses trades", async () => {
    const sock = new FakeSocket();
    const hub = createQuoteHub({
      connect: () => sock,
      fetchToken: async () => "tok",
      nowMs: () => NOW_MS,
      wsUrl: "wss://example.test/ws",
    });
    const prices: number[] = [];
    const unsub = hub.subscribe("005930", (tick) => prices.push(tick.price));
    await flush();
    sock.fire("open");
    assert.equal(sock.sent[0], buildLoginMessage("tok"));
    sock.fire(
      "message",
      JSON.stringify({ trnm: "LOGIN", return_code: 0, return_msg: "ok" })
    );
    await flush();
    const reg = JSON.parse(sock.sent[1]!) as {
      trnm: string;
      refresh: string;
      data: Array<{ item: string[]; type: string[] }>;
    };
    assert.equal(reg.trnm, "REG");
    assert.equal(reg.refresh, "1");
    assert.deepEqual(reg.data[0]!.item, ["005930"]);
    assert.deepEqual(reg.data[0]!.type, ["0B"]);

    const ping = '{"trnm":"PING","extra":1}';
    sock.fire("message", ping);
    await flush();
    assert.equal(sock.sent.at(-1), ping);

    sock.fire(
      "message",
      JSON.stringify({
        trnm: "REAL",
        data: [
          {
            type: "0B",
            item: "005930",
            values: { "10": "-70000", "15": "4", "20": "090105" },
          },
        ],
      })
    );
    await flush();
    assert.deepEqual(prices, [70000]);

    unsub();
    const remove = JSON.parse(sock.sent.at(-1)!) as { trnm: string; data: Array<{ item: string[] }> };
    assert.equal(remove.trnm, "REMOVE");
    assert.deepEqual(remove.data[0]!.item, ["005930"]);
    hub.close();
  });
});

describe("kiwoom routing", () => {
  const prevKey = process.env.KIWOOM_APP_KEY;
  const prevSecret = process.env.KIWOOM_APP_SECRET;
  const prevRest = process.env.KIWOOM_REST_URL;

  after(() => {
    if (prevKey == null) delete process.env.KIWOOM_APP_KEY;
    else process.env.KIWOOM_APP_KEY = prevKey;
    if (prevSecret == null) delete process.env.KIWOOM_APP_SECRET;
    else process.env.KIWOOM_APP_SECRET = prevSecret;
    if (prevRest == null) delete process.env.KIWOOM_REST_URL;
    else process.env.KIWOOM_REST_URL = prevRest;
    resetKiwoomRestForTests();
    resetKiwoomBarSessionsForTests();
  });

  it("leaves US symbols on the fallback adapter", async () => {
    const fallback: MarketDataAdapter = {
      id: "fallback",
      label: "fallback",
      mode: "delayed",
      async getCandles() {
        return [{ time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
      },
    };
    const adapter = new KiwoomRoutedMarketDataAdapter(fallback, {
      subscribe: () => () => undefined,
      whenLoggedIn: async () => true,
      close() {},
    });
    const bars = await adapter.getCandles({
      symbolId: "us_tsla",
      ticker: "TSLA",
      exchange: "NASDAQ",
      assetClass: "us_stock",
      timeframe: "D",
    });
    assert.equal(bars[0]!.close, 1);
  });

  it("reads a minute chart from the REST payload", async () => {
    process.env.KIWOOM_APP_KEY = "test-app";
    process.env.KIWOOM_APP_SECRET = "test-secret";
    process.env.KIWOOM_REST_URL = "https://kiwoom.test";
    setKiwoomRequestGapForTests(0);
    resetKiwoomRestForTests();
    setKiwoomRequestGapForTests(0);
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/oauth2/token")) {
        return new Response(
          JSON.stringify({
            token: "access-token",
            expires_dt: "20260928235959",
            return_code: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("api-id"), "ka10080");
      assert.equal(headers.get("authorization"), "Bearer access-token");
      return new Response(
        JSON.stringify({
          return_code: 0,
          stk_min_pole_chart_qry: [
            {
              cur_prc: "+74800",
              open_pric: "74700",
              high_pric: "74900",
              low_pric: "74600",
              trde_qty: "20",
              cntr_tm: "20260928090100",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json", "cont-yn": "N" } }
      );
    }) as typeof fetch;
    try {
      const bars = await fetchKiwoomCandles("005930", { timeframe: "1", limit: 5 });
      assert.equal(bars.length, 1);
      assert.equal(bars[0]!.close, 74800);
      assert.equal(bars[0]!.open, 74700);
    } finally {
      globalThis.fetch = orig;
      resetKiwoomRestForTests();
    }
  });
});
