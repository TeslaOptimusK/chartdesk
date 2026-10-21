import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { Candle } from "@/lib/types";

type StorageModule = typeof import("@/lib/storage");
type AlertEngineModule = typeof import("@/lib/alert-engine");

const root = mkdtempSync(path.join(os.tmpdir(), "chartdesk-store-"));
const dataDir = path.join(root, "data");
const previousCwd = process.cwd();
let storage: StorageModule;
let engine: AlertEngineModule;

function bars(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

before(async () => {
  process.chdir(root);
  storage = await import("@/lib/storage");
  engine = await import("@/lib/alert-engine");
});

after(async () => {
  await engine?.alertDeliveriesSettled();
  process.chdir(previousCwd);
  rmSync(root, { recursive: true, force: true });
});

describe("store file", () => {
  it("keeps an unreadable store aside instead of replacing it with the seed", async () => {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path.join(dataDir, "store.json"), '{"symbols": [', "utf8");

    const store = await storage.readStore();
    assert.ok(store.symbols.length > 0);

    const kept = readdirSync(dataDir).filter((name) => name.startsWith("store.corrupt-"));
    assert.equal(kept.length, 1);
    assert.equal(readFileSync(path.join(dataDir, kept[0]!), "utf8"), '{"symbols": [');
    assert.doesNotThrow(() => JSON.parse(readFileSync(path.join(dataDir, "store.json"), "utf8")));
  });

  it("keeps every concurrent write and leaves no temp files", async () => {
    const before = (await storage.readStore()).comments.length;
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        Promise.all([
          storage.addComment({ symbolId: "us_NVDA", body: `note ${i}`, author: "test" }),
          storage.readStore(),
        ])
      )
    );
    const store = await storage.readStore();
    assert.equal(store.comments.length, before + 25);
    assert.deepEqual(
      readdirSync(dataDir).filter((name) => name.endsWith(".tmp")),
      []
    );
  });
});

describe("alert claims", () => {
  it("fires a crossed watch once even when two evaluations race", async () => {
    const symbolId = (await storage.readStore()).symbols[0]!.id;
    const watch = await storage.addPriceWatchServer({ symbolId, price: 100, op: "above" });
    const candles = bars([90, 95, 101]);

    const [a, b] = await Promise.all([
      engine.evaluateSymbolAlerts({ symbolId, candles }),
      engine.evaluateSymbolAlerts({ symbolId, candles }),
    ]);
    assert.equal(a.fired.length + b.fired.length, 1);

    const store = await storage.readStore();
    const saved = store.priceWatches.find((w) => w.id === watch.id);
    assert.equal(saved?.triggered, true);
    assert.equal(saved?.lastClose, 101);
    const fired = [...a.fired, ...b.fired][0]!;
    assert.equal(store.alerts.filter((x) => x.id === fired.id).length, 1);
  });

  it("does not drop a watch that was added while an evaluation ran", async () => {
    const symbolId = (await storage.readStore()).symbols[0]!.id;
    await storage.addPriceWatchServer({ symbolId, price: 50, op: "above" });
    const evaluation = engine.evaluateSymbolAlerts({ symbolId, candles: bars([40, 60]) });
    const added = await storage.addPriceWatchServer({ symbolId, price: 999, op: "above" });
    await evaluation;

    const store = await storage.readStore();
    assert.ok(store.priceWatches.some((w) => w.id === added.id && !w.triggered));
  });

  it("removes one watch by id", async () => {
    const symbolId = (await storage.readStore()).symbols[0]!.id;
    const keep = await storage.addPriceWatchServer({ symbolId, price: 1, op: "below" });
    const drop = await storage.addPriceWatchServer({ symbolId, price: 2, op: "below" });
    const left = await storage.removePriceWatch(drop.id);
    assert.ok(left.some((w) => w.id === keep.id));
    assert.ok(!left.some((w) => w.id === drop.id));
  });
});
