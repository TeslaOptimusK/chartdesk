import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clockQuotePhase,
  mergeQuotePhase,
  resolveSessionQuote,
} from "@/lib/session-quote";

describe("session quote", () => {
  it("shows the close versus the prior close before the open", () => {
    const view = resolveSessionQuote({
      phase: "pre",
      dailyCloses: [340, 357.45, 352.84],
      lastBarIsToday: false,
      livePrice: 352.84,
      prePrice: 353.53,
    });
    assert.equal(view?.priceKind, "close");
    assert.equal(view?.displayPrice, 352.84);
    assert.equal(view?.changeBase, 357.45);
    assert.equal(view?.closeLine, 352.84);
    assert.equal(view?.preLine, 353.53);
    assert.ok(view!.changePct < 0);
  });

  it("switches the quoted price to the live print once the session is open", () => {
    const view = resolveSessionQuote({
      phase: "regular",
      dailyCloses: [357.45, 352.84],
      lastBarIsToday: true,
      livePrice: 355,
      prePrice: 353.53,
    });
    assert.equal(view?.priceKind, "live");
    assert.equal(view?.displayPrice, 355);
    assert.equal(view?.changeBase, 357.45);
    assert.equal(view?.closeLine, 357.45);
    assert.equal(view?.preLine, null);
  });

  it("keeps a closed session on the official close", () => {
    const view = resolveSessionQuote({
      phase: "closed",
      dailyCloses: [357.45, 352.84],
      lastBarIsToday: true,
      livePrice: 352.84,
      prePrice: null,
    });
    assert.equal(view?.displayPrice, 352.84);
    assert.equal(view?.changeBase, 357.45);
    assert.equal(view?.preLine, null);
  });

  it("lets Yahoo's closed state override a pre-market clock", () => {
    assert.equal(mergeQuotePhase("pre", "CLOSED"), "closed");
    assert.equal(mergeQuotePhase("closed", "PRE"), "pre");
    assert.equal(mergeQuotePhase("always", "PRE"), "always");
  });

  it("treats a Korean morning before 9 as pre-market", () => {
    const morning = new Date("2026-09-30T23:30:00.000Z");
    assert.equal(clockQuotePhase("kr_stock", "KRX", morning), "pre");
  });
});
