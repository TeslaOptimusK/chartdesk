import type { Candle, Timeframe } from "@/lib/types";
import type { CandleQuery } from "@/lib/market-data/types";
import {
  candlesFromChartBody,
  chartQuerySpec,
  chartRowsFromBody,
  kiwoomOk,
  kstYmdHmsToEpoch,
} from "@/lib/kiwoom/quote-protocol";

export class KiwoomQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KiwoomQuoteError";
  }
}

export function kiwoomQuotesConfigured(): boolean {
  return Boolean(
    process.env.KIWOOM_APP_KEY?.trim() && process.env.KIWOOM_APP_SECRET?.trim()
  );
}

export function kiwoomEndpoints(): { rest: string; ws: string; mock: boolean } {
  const host = (process.env.KIWOOM_QUOTE_HOST ?? "real").trim().toLowerCase();
  const mock = host === "mock" || host === "demo";
  const rest =
    process.env.KIWOOM_REST_URL?.trim() ||
    (mock ? "https://mockapi.kiwoom.com" : "https://api.kiwoom.com");
  const ws =
    process.env.KIWOOM_WS_URL?.trim() ||
    (mock
      ? "wss://mockapi.kiwoom.com:10000/api/dostk/websocket"
      : "wss://api.kiwoom.com:10000/api/dostk/websocket");
  return { rest, ws, mock };
}

type TokenState = { token: string; expiresAtSec: number };
let tokenState: TokenState | null = null;
let gapMs = 220;
let chain: Promise<unknown> = Promise.resolve();

const chartCache = new Map<string, { expires: number; bars: Candle[] }>();

export function resetKiwoomRestForTests(): void {
  tokenState = null;
  chartCache.clear();
  gapMs = 220;
  requestTimeoutMs = REQUEST_TIMEOUT_MS;
  chain = Promise.resolve();
  outboundIpCache = null;
}

/** Kiwoom 8050: the app key is fine, but this PC's public address is not on the allowlist. */
export function kiwoomNeedsIpRegistration(message: string): boolean {
  return message.includes("8050") || message.includes("IP가 등록되지 않았습니다");
}

let outboundIpCache: { ip: string; at: number } | null = null;

/** Public address Kiwoom sees when this process calls the API. */
export async function lookupOutboundIp(): Promise<string | null> {
  const now = Date.now();
  if (outboundIpCache && now - outboundIpCache.at < 5 * 60_000) return outboundIpCache.ip;
  try {
    const res = await fetch("https://api.ipify.org", {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const ip = (await res.text()).trim();
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i.test(ip)) return outboundIpCache?.ip ?? null;
    outboundIpCache = { ip, at: now };
    return ip;
  } catch {
    return outboundIpCache?.ip ?? null;
  }
}

export function setKiwoomRequestGapForTests(ms: number): void {
  gapMs = ms;
}

/**
 * Every broker call shares one queue, so a request that never answers would
 * also hold back stop-loss sells. Undici would otherwise wait five minutes.
 */
const REQUEST_TIMEOUT_MS = 15_000;
let requestTimeoutMs = REQUEST_TIMEOUT_MS;

export function setKiwoomRequestTimeoutForTests(ms: number): void {
  requestTimeoutMs = ms;
}

/** A timed-out order may still have reached the broker. */
const ORDER_API_IDS = new Set(["kt10000", "kt10001", "kt10002", "kt10003", "ust20001"]);

function timeoutMessage(apiId: string): string {
  return ORDER_API_IDS.has(apiId)
    ? "키움 주문 응답이 15초 안에 오지 않았습니다. 접수 여부를 계좌에서 확인하세요"
    : "키움 응답이 15초 안에 오지 않았습니다";
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    return fn();
  });
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Fetch and read the JSON body inside the queue slot, under one deadline. */
async function postJson(
  url: string,
  apiId: string,
  headers: Record<string, string>,
  body: unknown
): Promise<{ res: Response; json: Record<string, unknown> }> {
  try {
    return await enqueue(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "api-id": apiId,
          ...headers,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const json = (await res.json().catch((err: unknown) => {
        if (isTimeout(err)) throw err;
        return {};
      })) as Record<string, unknown>;
      return { res, json };
    });
  } catch (err) {
    if (isTimeout(err)) throw new KiwoomQuoteError(timeoutMessage(apiId));
    throw err;
  }
}

function assertBodyOk(json: unknown, status: number): void {
  if (status < 200 || status >= 300) {
    throw new KiwoomQuoteError(`Kiwoom HTTP ${status}`);
  }
  const row = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  if (!row || kiwoomOk(row.return_code)) return;
  const msg =
    typeof row.return_msg === "string" && row.return_msg.trim()
      ? row.return_msg.trim().slice(0, 180)
      : "Kiwoom request failed";
  throw new KiwoomQuoteError(msg);
}

export async function issueKiwoomToken(force = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!force && tokenState && tokenState.expiresAtSec - 60 > now) {
    return tokenState.token;
  }
  const appkey = process.env.KIWOOM_APP_KEY?.trim();
  const secretkey = process.env.KIWOOM_APP_SECRET?.trim();
  if (!appkey || !secretkey) {
    throw new KiwoomQuoteError("KIWOOM_APP_KEY and KIWOOM_APP_SECRET are required");
  }
  const { rest } = kiwoomEndpoints();
  const { res, json } = await postJson(`${rest}/oauth2/token`, "au10001", {}, {
    grant_type: "client_credentials",
    appkey,
    secretkey,
  });
  assertBodyOk(json, res.status);
  const token = typeof json.token === "string" ? json.token : "";
  if (!token) throw new KiwoomQuoteError("Kiwoom token response had no token");
  const exp =
    typeof json.expires_dt === "string" ? kstYmdHmsToEpoch(json.expires_dt) : null;
  tokenState = {
    token,
    expiresAtSec: exp && exp > now ? exp : now + 23 * 3600,
  };
  return token;
}

/** Authorized REST POST. Shares the token cache and the request gap with chart calls. */
export async function kiwoomAuthorizedPost(
  path: string,
  apiId: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const page = await kiwoomAuthorizedPage(path, apiId, body, "N", "");
  return page.json;
}

function headerValue(res: Response, name: string): string | null {
  return res.headers.get(name) ?? res.headers.get(name.toLowerCase());
}

async function kiwoomAuthorizedPage(
  path: string,
  apiId: string,
  body: Record<string, unknown>,
  contYn: string,
  nextKey: string
): Promise<{ json: Record<string, unknown>; contYn: string | null; nextKey: string | null }> {
  const token = await issueKiwoomToken();
  const { rest } = kiwoomEndpoints();
  const { res, json } = await postJson(
    `${rest}${path}`,
    apiId,
    { authorization: `Bearer ${token}`, "cont-yn": contYn, "next-key": nextKey },
    body
  );
  assertBodyOk(json, res.status);
  const bodyNext =
    typeof json.next_key === "string"
      ? json.next_key
      : typeof json["next-key"] === "string"
        ? json["next-key"]
        : null;
  const bodyCont =
    json.cont_yn === "Y" || json.contin_yn === "Y" || json["cont-yn"] === "Y" ? "Y" : null;
  return {
    json,
    contYn: headerValue(res, "cont-yn") ?? bodyCont,
    nextKey: headerValue(res, "next-key") ?? bodyNext,
  };
}

function appendListPages(into: Record<string, unknown>, page: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(page)) {
    if (!Array.isArray(value)) continue;
    const prev = into[key];
    into[key] = Array.isArray(prev) ? [...prev, ...value] : value;
  }
}

/** Follows Kiwoom continuation keys so a long holdings list is not cut off. */
export async function kiwoomAuthorizedPostAll(
  path: string,
  apiId: string,
  body: Record<string, unknown>,
  maxPages = 8
): Promise<Record<string, unknown>> {
  let contYn = "N";
  let nextKey = "";
  let merged: Record<string, unknown> | null = null;
  const pages = Math.max(1, Math.min(30, Math.trunc(maxPages)));
  for (let page = 0; page < pages; page++) {
    const result = await kiwoomAuthorizedPage(path, apiId, body, contYn, nextKey);
    if (!merged) merged = result.json;
    else appendListPages(merged, result.json);
    if (result.contYn !== "Y" || !result.nextKey || result.nextKey === nextKey) break;
    contYn = "Y";
    nextKey = result.nextKey;
  }
  return merged ?? {};
}

async function postChart(
  apiId: string,
  body: Record<string, string>,
  token: string,
  contYn: string,
  nextKey: string
): Promise<{ json: unknown; contYn: string | null; nextKey: string | null }> {
  const { rest } = kiwoomEndpoints();
  const { res, json } = await postJson(
    `${rest}/api/dostk/chart`,
    apiId,
    { authorization: `Bearer ${token}`, "cont-yn": contYn, "next-key": nextKey },
    body
  );
  assertBodyOk(json, res.status);
  return {
    json,
    contYn: res.headers.get("cont-yn"),
    nextKey: res.headers.get("next-key"),
  };
}

export async function fetchKiwoomCandles(
  code: string,
  query: Pick<CandleQuery, "timeframe" | "limit" | "from" | "to">
): Promise<Candle[]> {
  const nowSec = Math.floor(Date.now() / 1000);
  const spec = chartQuerySpec(query.timeframe, code, nowSec);
  const limit = query.limit ?? 180;
  const cacheKey = `${spec.apiId}|${JSON.stringify(spec.body)}|${limit}|${query.from ?? ""}|${query.to ?? ""}`;
  const hit = chartCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.bars;

  const token = await issueKiwoomToken();
  const rows: Record<string, unknown>[] = [];
  let contYn = "N";
  let nextKey = "";
  for (let page = 0; page < 4; page++) {
    const pageRes = await postChart(spec.apiId, spec.body, token, contYn, nextKey);
    rows.push(...chartRowsFromBody(pageRes.json));
    if (pageRes.contYn !== "Y" || !pageRes.nextKey) break;
    if (rows.length >= limit) break;
    contYn = "Y";
    nextKey = pageRes.nextKey;
  }

  let bars = candlesFromChartBody({ stk_min_pole_chart_qry: rows }, query.timeframe as Timeframe, limit, nowSec);
  if (query.from != null || query.to != null) {
    bars = bars.filter((bar) => {
      if (query.from != null && bar.time < query.from) return false;
      if (query.to != null && bar.time > query.to) return false;
      return true;
    });
  }
  chartCache.set(cacheKey, { expires: Date.now() + 15_000, bars });
  return bars;
}
