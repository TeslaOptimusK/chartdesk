import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hostAllowed, requestBlockReason, type GuardInput } from "@/lib/request-guard";

const base: GuardInput = {
  method: "POST",
  pathname: "/api/kiwoom/order",
  host: "127.0.0.1:43127",
  origin: "http://127.0.0.1:43127",
  fetchSite: "same-origin",
};

describe("local API guard", () => {
  it("lets the app post to its own origin", () => {
    assert.equal(requestBlockReason(base), null);
  });

  it("blocks a post from another site, including text/plain simple requests", () => {
    assert.equal(
      requestBlockReason({ ...base, origin: "https://evil.example", fetchSite: "cross-site" }),
      "cross_origin"
    );
    assert.equal(requestBlockReason({ ...base, origin: "null", fetchSite: null }), "cross_origin");
    assert.equal(
      requestBlockReason({ ...base, origin: "http://localhost:5173", fetchSite: "same-site" }),
      "cross_origin"
    );
  });

  it("blocks a cross-site post that carries no Origin header", () => {
    assert.equal(requestBlockReason({ ...base, origin: null, fetchSite: "cross-site" }), "cross_origin");
  });

  it("allows scripts and tools that send neither Origin nor Sec-Fetch-Site", () => {
    assert.equal(requestBlockReason({ ...base, origin: null, fetchSite: null }), null);
  });

  it("keeps reads open and leaves the ingest webhook to outside tools", () => {
    assert.equal(
      requestBlockReason({ ...base, method: "GET", origin: "https://evil.example", fetchSite: "cross-site" }),
      null
    );
    assert.equal(
      requestBlockReason({
        ...base,
        pathname: "/api/ingest/webhook",
        origin: "https://www.fanding.kr",
        fetchSite: "cross-site",
      }),
      null
    );
  });

  it("refuses a rebound DNS name even for reads", () => {
    assert.equal(
      requestBlockReason({ ...base, method: "GET", host: "attacker.example:43127", origin: null }),
      "blocked_host"
    );
    assert.equal(hostAllowed("127.0.0.1.nip.io:43127"), false);
  });

  it("accepts loopback names, IP literals, and listed hosts", () => {
    assert.equal(hostAllowed("localhost:43127"), true);
    assert.equal(hostAllowed("[::1]:43127"), true);
    assert.equal(hostAllowed("192.168.0.12:43127"), true);
    assert.equal(hostAllowed("100.64.1.2"), true);
    assert.equal(hostAllowed("desk.tail1234.ts.net:43127"), false);
    assert.equal(hostAllowed("desk.tail1234.ts.net:43127", "desk.tail1234.ts.net"), true);
  });
});
