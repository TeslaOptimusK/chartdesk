import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { kiwoomAuthorizedPost, resetKiwoomRestForTests } from "@/lib/kiwoom/quote-rest";
import {
  evaluateBridgeCall,
  KiwoomBridgeError,
  kiwoomBridgeCall,
  parseBridgeCall,
  resetKiwoomBridgeForTests,
  type BridgeCall,
  type BridgePage,
} from "@/lib/kiwoom/bridge";

const TOKEN = "bridge-token-value";

function call(overrides: Partial<BridgeCall> = {}): BridgeCall {
  return {
    path: "/api/dostk/acnt",
    apiId: "kt00001",
    body: { qry_tp: "3" },
    contYn: "N",
    nextKey: "",
    ...overrides,
  };
}

describe("kiwoom bridge protocol", () => {
  afterEach(() => {
    delete process.env.KIWOOM_BRIDGE_URL;
    delete process.env.KIWOOM_BRIDGE_TOKEN;
    delete process.env.KIWOOM_APP_KEY;
    delete process.env.KIWOOM_APP_SECRET;
    resetKiwoomBridgeForTests();
    resetKiwoomRestForTests();
  });

  it("rejects a missing token, a wrong token, and a path that is not a Kiwoom REST call", async () => {
    const dispatch = async (): Promise<BridgePage> => {
      throw new Error("should not run");
    };
    const missing = await evaluateBridgeCall(null, call(), TOKEN, dispatch);
    assert.equal(missing.status, 401);
    const wrong = await evaluateBridgeCall("Bearer other-token-value", call(), TOKEN, dispatch);
    assert.equal(wrong.status, 401);
    assert.equal(typeof parseBridgeCall({ path: "/oauth2/token", apiId: "au10001", body: {} }), "string");
    const bad = await evaluateBridgeCall(`Bearer ${TOKEN}`, { path: "https://evil.example", apiId: "kt00001", body: {} }, TOKEN, dispatch);
    assert.equal(bad.status, 400);
  });

  it("forwards an account read and returns the Kiwoom page", async () => {
    const seen: { current: BridgeCall | null } = { current: null };
    const result = await evaluateBridgeCall(
      `Bearer ${TOKEN}`,
      call(),
      TOKEN,
      async (input) => {
        seen.current = input;
        return { status: 200, json: { return_code: 0, entr: "10" }, contYn: "N", nextKey: null, mock: false };
      }
    );
    assert.equal(result.status, 200);
    assert.equal(seen.current?.apiId, "kt00001");
    assert.equal((result.body as { json: { entr: string } }).json.entr, "10");
  });

  it("sends the account read to the mini-PC and does not put the app secret on that request", async () => {
    process.env.KIWOOM_BRIDGE_URL = "http://100.64.1.8:43128";
    process.env.KIWOOM_BRIDGE_TOKEN = TOKEN;
    process.env.KIWOOM_APP_KEY = "local-app-key";
    process.env.KIWOOM_APP_SECRET = "local-app-secret";
    const orig = globalThis.fetch;
    let posted = "";
    let url = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      posted = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          ok: true,
          status: 200,
          json: { return_code: 0, entr: "42" },
          contYn: null,
          nextKey: null,
          mock: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;
    try {
      const page = await kiwoomAuthorizedPost("/api/dostk/acnt", "kt00018", { qry_tp: "1" });
      assert.equal(page.entr, "42");
      assert.equal(url, "http://100.64.1.8:43128/v1/call");
      assert.equal(posted.includes("local-app-secret"), false);
      assert.equal(posted.includes("kt00018"), true);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("says the mini-PC bridge is unreachable instead of a generic account failure", async () => {
    process.env.KIWOOM_BRIDGE_URL = "http://100.64.1.8:43128";
    process.env.KIWOOM_BRIDGE_TOKEN = TOKEN;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      await assert.rejects(kiwoomBridgeCall(call()), (err: unknown) => {
        assert.ok(err instanceof KiwoomBridgeError);
        assert.match(err.message, /집 미니 PC 브리지에 연결하지 못했습니다/);
        return true;
      });
    } finally {
      globalThis.fetch = orig;
    }
  });
});
