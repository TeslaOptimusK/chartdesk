/**
 * The API places live broker orders, so a page on another site must not be able
 * to post to it, and a rebound DNS name must not reach it at all.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Outside tools post here on purpose; a forged post only queues a draft for review. */
const OPEN_POST_PATHS = new Set(["/api/ingest/webhook"]);

export interface GuardInput {
  method: string;
  pathname: string;
  host: string | null;
  origin: string | null;
  fetchSite: string | null;
  /** Comma-separated extra host names, e.g. a Tailscale MagicDNS name. */
  allowedHosts?: string;
}

export type GuardBlock = "blocked_host" | "cross_origin";

function hostName(host: string): string {
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

/** IP literals cannot be rebound, so only names need to be on the list. */
export function hostAllowed(host: string | null, allowedHosts?: string): boolean {
  if (!host) return true;
  const name = hostName(host);
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  if (isIpLiteral(name)) return true;
  const extra = (allowedHosts ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(name);
}

export function requestBlockReason(input: GuardInput): GuardBlock | null {
  if (!hostAllowed(input.host, input.allowedHosts)) return "blocked_host";
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
