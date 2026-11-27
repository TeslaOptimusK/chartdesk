import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

/** Thrown by the bridge client. quote-rest turns this into a KiwoomQuoteError. */
export class KiwoomBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KiwoomBridgeError";
  }
}

/**
 * The home mini-PC holds the Kiwoom app key and the registered public IP.
 * Another ChartDesk sends account, order, and chart REST calls here so Kiwoom
 * sees that PC. Do not set KIWOOM_BRIDGE_URL on the mini-PC itself.
 */

const ALLOWED_PATHS = new Set([
  "/api/dostk/acnt",
  "/api/dostk/ordr",
  "/api/dostk/chart",
  "/api/us/acnt",
  "/api/us/ordr",
]);

const MAX_BODY = 64 * 1024;
const CLIENT_TIMEOUT_MS = 25_000;

export interface BridgeCall {
  path: string;
  apiId: string;
  body: Record<string, unknown>;
  contYn: string;
  nextKey: string;
}

export interface BridgePage {
  status: number;
  json: Record<string, unknown>;
  contYn: string | null;
  nextKey: string | null;
  mock: boolean;
  outboundIp?: string | null;
}

interface BridgeMeta {
  mock: boolean | null;
  outboundIp: string | null;
}

const bridgeMeta: BridgeMeta = { mock: null, outboundIp: null };

export function resetKiwoomBridgeForTests(): void {
  bridgeMeta.mock = null;
  bridgeMeta.outboundIp = null;
}

/** Set on the machine that should delegate Kiwoom REST to the mini-PC. */
export function kiwoomBridgeClient(): { url: string; token: string } | null {
  const url = process.env.KIWOOM_BRIDGE_URL?.trim().replace(/\/$/, "") ?? "";
  const token = process.env.KIWOOM_BRIDGE_TOKEN?.trim() ?? "";
  if (!url || !token) return null;
  return { url, token };
}

export function kiwoomBridgeMock(): boolean | null {
  return bridgeMeta.mock;
}

export function kiwoomBridgeOutboundIp(): string | null {
  return bridgeMeta.outboundIp;
}

function remember(page: { mock?: boolean; outboundIp?: string | null }): void {
  if (typeof page.mock === "boolean") bridgeMeta.mock = page.mock;
  if (typeof page.outboundIp === "string" && page.outboundIp.trim()) {
    bridgeMeta.outboundIp = page.outboundIp.trim();
  }
}

export async function kiwoomBridgeCall(call: BridgeCall): Promise<BridgePage> {
  const client = kiwoomBridgeClient();
  if (!client) throw new KiwoomBridgeError("미니 PC 브리지 주소가 없습니다");
  let endpoint: URL;
  try {
    endpoint = new URL(`${client.url}/v1/call`);
  } catch {
    throw new KiwoomBridgeError("KIWOOM_BRIDGE_URL이 올바른 주소가 아닙니다");
  }
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new KiwoomBridgeError("KIWOOM_BRIDGE_URL은 http 또는 https 여야 합니다");
  }
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${client.token}`,
      },
      body: JSON.stringify(call),
      cache: "no-store",
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "연결 실패";
    throw new KiwoomBridgeError(
      `집 미니 PC 브리지에 연결하지 못했습니다 (${detail}). 미니 PC에서 ChartDesk가 켜져 있는지, KIWOOM_BRIDGE_URL이 그 주소인지 확인하세요`
    );
  }
  const payload = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    status?: number;
    json?: Record<string, unknown>;
    contYn?: string | null;
    nextKey?: string | null;
    mock?: boolean;
    outboundIp?: string | null;
  } | null;
  if (payload) remember(payload);
  if (!res.ok || !payload || payload.ok !== true || !payload.json) {
    const message =
      res.status === 401
        ? "미니 PC 브리지 토큰이 맞지 않습니다. 양쪽 KIWOOM_BRIDGE_TOKEN을 같은 값으로 맞추세요"
        : typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim().slice(0, 180)
          : `미니 PC 브리지가 ${res.status}을 반환했습니다`;
    throw new KiwoomBridgeError(message);
  }
  return {
    status: typeof payload.status === "number" ? payload.status : 200,
    json: payload.json,
    contYn: payload.contYn ?? null,
    nextKey: payload.nextKey ?? null,
    mock: payload.mock === true,
    outboundIp: payload.outboundIp ?? null,
  };
}

function bearer(header: string | null): string {
  if (!header) return "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  return match?.[1] ?? "";
}

function tokenMatches(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function parseBridgeCall(payload: unknown): BridgeCall | string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "잘못된 요청입니다";
  const row = payload as Record<string, unknown>;
  const path = typeof row.path === "string" ? row.path : "";
  if (!ALLOWED_PATHS.has(path)) return "허용되지 않은 키움 경로입니다";
  const apiId = typeof row.apiId === "string" ? row.apiId.trim() : "";
  if (!/^[A-Za-z]{2,4}\d{4,5}$/.test(apiId)) return "키움 TR 코드가 올바르지 않습니다";
  if (!row.body || typeof row.body !== "object" || Array.isArray(row.body)) return "요청 본문이 올바르지 않습니다";
  const contYn = row.contYn === "Y" ? "Y" : "N";
  const nextKey = typeof row.nextKey === "string" ? row.nextKey.slice(0, 128) : "";
  if (/[\r\n]/.test(nextKey)) return "연속조회 키가 올바르지 않습니다";
  return { path, apiId, body: row.body as Record<string, unknown>, contYn, nextKey };
}

export async function evaluateBridgeCall(
  authorization: string | null,
  payload: unknown,
  expectedToken: string,
  dispatch: (call: BridgeCall) => Promise<BridgePage>
): Promise<{ status: number; body: unknown }> {
  if (!tokenMatches(bearer(authorization), expectedToken)) {
    return { status: 401, body: { ok: false, error: "unauthorized" } };
  }
  const call = parseBridgeCall(payload);
  if (typeof call === "string") return { status: 400, body: { ok: false, error: call } };
  try {
    const page = await dispatch(call);
    return {
      status: 200,
      body: {
        ok: true,
        status: page.status,
        json: page.json,
        contYn: page.contYn,
        nextKey: page.nextKey,
        mock: page.mock,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "KiwoomQuoteError" && err.message
        ? err.message
        : "키움 호출에 실패했습니다";
    const outboundIp =
      message.includes("8050") || message.includes("IP가 등록되지 않았습니다")
        ? await lookupIpForBridge()
        : null;
    return {
      status: 502,
      body: { ok: false, error: message.slice(0, 180), outboundIp },
    };
  }
}

async function lookupIpForBridge(): Promise<string | null> {
  const { lookupOutboundIp } = await import("@/lib/kiwoom/quote-rest");
  return lookupOutboundIp();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function dispatchLive(call: BridgeCall): Promise<BridgePage> {
  const { executeKiwoomBridgeCall } = await import("@/lib/kiwoom/quote-rest");
  return executeKiwoomBridgeCall(call);
}

/** Opens the bridge when this process is the mini-PC (`KIWOOM_BRIDGE_LISTEN=1`). */
export function listenKiwoomBridge(): void {
  if (process.env.KIWOOM_BRIDGE_LISTEN !== "1") return;
  const token = process.env.KIWOOM_BRIDGE_TOKEN?.trim() ?? "";
  if (token.length < 16) {
    console.error("[chartdesk] KIWOOM_BRIDGE_LISTEN is set, but KIWOOM_BRIDGE_TOKEN must be at least 16 characters");
    return;
  }
  const g = globalThis as typeof globalThis & { __chartdeskKiwoomBridge?: boolean };
  if (g.__chartdeskKiwoomBridge) return;
  g.__chartdeskKiwoomBridge = true;
  const port = Number(process.env.KIWOOM_BRIDGE_PORT ?? "43128");
  const host = process.env.KIWOOM_BRIDGE_BIND?.trim() || "0.0.0.0";
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("[chartdesk] KIWOOM_BRIDGE_PORT is not a valid port");
    return;
  }
  const server = createServer((req, res) => {
    void serveBridge(req, res, token);
  });
  server.on("error", (err) => {
    console.error("[chartdesk] kiwoom bridge failed to listen:", err instanceof Error ? err.message : err);
  });
  server.listen(port, host, () => {
    console.log(`[chartdesk] kiwoom bridge listening on ${host}:${port}`);
  });
}

async function serveBridge(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
  if (req.method !== "POST" || (req.url ?? "").split("?")[0] !== "/v1/call") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
    return;
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "잘못된 요청입니다" }));
    return;
  }
  const result = await evaluateBridgeCall(req.headers.authorization ?? null, payload, token, dispatchLive);
  res.writeHead(result.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.body));
}
