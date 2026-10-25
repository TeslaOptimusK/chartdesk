/**
 * ChartDesk can place live broker orders from this PC.
 * Pages on other sites must not be able to call the API, and a rebound DNS
 * name or a LAN address must not reach it unless the operator opts in.
 * The browser session cookie is a second check: opening the app plants it,
 * and other sites do not send it.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Outside tools post here on purpose. A forged post only queues a draft. */
const OPEN_POST_PATHS = new Set(["/api/ingest/webhook"]);

/** Launcher readiness probe. It returns no account data and no session cookie. */
const PUBLIC_PATHS = new Set(["/api/health"]);

const BROKER_MUTATIONS = new Set([
  "/api/kiwoom/order",
  "/api/kiwoom/sell",
  "/api/kiwoom/brackets",
]);

export const MAX_INGEST_BYTES = 1_000_000;

export interface GuardPolicy {
  allowedHosts?: string;
  /** When true, routable IP hosts are accepted. Off by default. */
  allowLan?: boolean;
}

export interface GuardInput {
  method: string;
  pathname: string;
  host: string | null;
  origin: string | null;
  fetchSite: string | null;
  /** Comma-separated extra host names, e.g. a Tailscale MagicDNS name. */
  allowedHosts?: string;
  allowLan?: boolean;
  /**
   * TCP peer, only when the server saw the socket itself.
   * Do not pass X-Forwarded-For: the client can set that header.
   */
  peer?: string | null;
}

export type GuardBlock = "blocked_host" | "blocked_peer" | "cross_origin";

function policyOf(policy?: string | GuardPolicy): GuardPolicy {
  if (!policy) return {};
  if (typeof policy === "string") return { allowedHosts: policy };
  return policy;
}

export function hostName(host: string): string {
  const value = host.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(1, end) : value;
  }
  const colon = value.lastIndexOf(":");
  return colon > 0 && value.indexOf(":") === colon ? value.slice(0, colon) : value;
}

function isIpLiteral(name: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(name) || name.includes(":");
}

/** 127.0.0.0/8, ::1, and IPv4-mapped loopback. */
export function isLoopbackIp(name: string): boolean {
  const value = name.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::1" || value === "0:0:0:0:0:0:0:1") return true;
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  const v4 = mapped?.[1] ?? value;
  const parts = v4.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return nums[0] === 127;
}

function listedHost(name: string, allowedHosts?: string): boolean {
  const extra = (allowedHosts ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(name);
}

/** Loopback is the default. Names and LAN IPs need an explicit allow. */
export function hostAllowed(host: string | null, policy?: string | GuardPolicy): boolean {
  if (!host) return true;
  const { allowedHosts, allowLan } = policyOf(policy);
  const name = hostName(host);
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (isLoopbackIp(name)) return true;
  if (listedHost(name, allowedHosts)) return true;
  return Boolean(allowLan && isIpLiteral(name));
}

/** Unknown peers are not blocked here; bind the server to loopback instead. */
export function peerAllowed(peer: string | null | undefined, allowLan = false): boolean {
  if (peer == null || peer.trim() === "") return true;
  return allowLan || isLoopbackIp(peer);
}

export function requestBlockReason(input: GuardInput): GuardBlock | null {
  const policy = { allowedHosts: input.allowedHosts, allowLan: input.allowLan };
  if (!hostAllowed(input.host, policy)) return "blocked_host";
  if (!peerAllowed(input.peer, input.allowLan)) return "blocked_peer";
  if (SAFE_METHODS.has(input.method.toUpperCase())) return null;
  if (OPEN_POST_PATHS.has(input.pathname)) return null;

  const origin = input.origin?.trim();
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return "cross_origin";
    }
    return originHost === (input.host ?? "").trim().toLowerCase() ? null : "cross_origin";
  }

  const site = input.fetchSite?.trim().toLowerCase();
  if (site && site !== "same-origin" && site !== "none") return "cross_origin";
  return null;
}

/**
 * Every API route except the readiness probe and the optional ingest webhook.
 * The browser sends the local cookie; a page on another site does not.
 */
export function localAuthRequired(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (PUBLIC_PATHS.has(pathname)) return false;
  if (OPEN_POST_PATHS.has(pathname)) return false;
  return true;
}

export function brokerMutation(method: string, pathname: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  return BROKER_MUTATIONS.has(pathname);
}

export function shouldIssueLocalCookie(input: {
  method: string;
  pathname: string;
  accept: string | null;
  fetchDest: string | null;
  fetchMode: string | null;
  fetchSite: string | null;
}): boolean {
  const method = input.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  if (input.pathname.startsWith("/api/") || input.pathname.startsWith("/_next")) return false;
  const site = input.fetchSite?.trim().toLowerCase();
  if (site && site !== "none" && site !== "same-origin") return false;
  if (input.fetchDest === "document" || input.fetchMode === "navigate") return true;
  if (input.pathname === "/") return true;
  return (input.accept ?? "").toLowerCase().includes("text/html");
}

/** Constant-time string compare. A length mismatch still scans both values. */
export function tokenMatches(presented: string | null | undefined, secret: string): boolean {
  const a = presented ?? "";
  const b = secret;
  if (!b) return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function bodyTooLarge(
  contentLength: string | null,
  byteLength: number,
  max = MAX_INGEST_BYTES
): boolean {
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > max) return true;
  }
  return byteLength > max;
}

export function createRateLimiter(limit: number, windowMs: number) {
  const hits: number[] = [];
  return (now: number) => {
    const cutoff = now - windowMs;
    while (hits.length > 0 && hits[0]! <= cutoff) hits.shift();
    if (hits.length >= limit) return false;
    hits.push(now);
    return true;
  };
}
