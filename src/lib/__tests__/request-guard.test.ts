import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bodyTooLarge,
  brokerMutation,
  createRateLimiter,
  hostAllowed,
  isLoopbackIp,
  localAuthRequired,
  peerAllowed,
  requestBlockReason,
  shouldIssueLocalCookie,
  tokenMatches,
  type GuardInput,
} from "@/lib/request-guard";

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

  it("accepts loopback only, unless a host or the LAN opt-in is listed", () => {
    assert.equal(hostAllowed("localhost:43127"), true);
    assert.equal(hostAllowed("[::1]:43127"), true);
    assert.equal(hostAllowed("127.0.0.2:43127"), true);
    assert.equal(isLoopbackIp("::ffff:127.0.0.1"), true);
    assert.equal(hostAllowed("192.168.0.12:43127"), false);
    assert.equal(hostAllowed("100.64.1.2"), false);
    assert.equal(hostAllowed("192.168.0.12:43127", { allowLan: true }), true);
    assert.equal(hostAllowed("100.64.1.2", { allowedHosts: "100.64.1.2" }), true);
    assert.equal(hostAllowed("desk.tail1234.ts.net:43127"), false);
    assert.equal(hostAllowed("desk.tail1234.ts.net:43127", "desk.tail1234.ts.net"), true);
  });

  it("blocks a non-loopback socket peer unless LAN access is explicit", () => {
    assert.equal(peerAllowed("127.0.0.1"), true);
    assert.equal(peerAllowed("::1"), true);
    assert.equal(peerAllowed(null), true);
    assert.equal(requestBlockReason({ ...base, peer: "192.168.1.5" }), "blocked_peer");
    assert.equal(requestBlockReason({ ...base, peer: "192.168.1.5", allowLan: true }), null);
  });

  it("requires the local session on API routes except health and ingest", () => {
    assert.equal(localAuthRequired("/api/kiwoom/order"), true);
    assert.equal(localAuthRequired("/api/kiwoom/account"), true);
    assert.equal(localAuthRequired("/api/bootstrap"), true);
    assert.equal(localAuthRequired("/api/candles"), true);
    assert.equal(localAuthRequired("/api/health"), false);
    assert.equal(localAuthRequired("/api/ingest/webhook"), false);
    assert.equal(localAuthRequired("/"), false);
  });

  it("plants the session cookie on a top-level visit, not on a cross-site load", () => {
    assert.equal(
      shouldIssueLocalCookie({
        method: "GET",
        pathname: "/",
        accept: "text/html",
        fetchDest: "document",
        fetchMode: "navigate",
        fetchSite: "none",
      }),
      true
    );
    assert.equal(
      shouldIssueLocalCookie({
        method: "GET",
        pathname: "/",
        accept: "image/avif",
        fetchDest: "image",
        fetchMode: "no-cors",
        fetchSite: "cross-site",
      }),
      false
    );
    assert.equal(
      shouldIssueLocalCookie({
        method: "GET",
        pathname: "/api/health",
        accept: "*/*",
        fetchDest: null,
        fetchMode: null,
        fetchSite: null,
      }),
      false
    );
  });

  it("compares tokens without stopping at the first differing character", () => {
    assert.equal(tokenMatches("abc", "abc"), true);
    assert.equal(tokenMatches("abc", "abd"), false);
    assert.equal(tokenMatches("ab", "abc"), false);
    assert.equal(tokenMatches(null, "abc"), false);
    assert.equal(tokenMatches("abc", ""), false);
  });

  it("caps broker mutations and oversized ingest bodies", () => {
    assert.equal(brokerMutation("POST", "/api/kiwoom/order"), true);
    assert.equal(brokerMutation("GET", "/api/kiwoom/order"), false);
    assert.equal(brokerMutation("POST", "/api/drawings"), false);
    const allow = createRateLimiter(2, 1_000);
    assert.equal(allow(1_000), true);
    assert.equal(allow(1_100), true);
    assert.equal(allow(1_200), false);
    assert.equal(allow(2_200), true);
    assert.equal(bodyTooLarge("100", 100, 1_000), false);
    assert.equal(bodyTooLarge("5000", 0, 1_000), true);
    assert.equal(bodyTooLarge(null, 2_000, 1_000), true);
  });
});
