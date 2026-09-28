import {
  buildLoginMessage,
  buildRegMessage,
  buildRemoveMessage,
  isPingMessage,
  parseRealTicks,
  type KiwoomTick,
} from "@/lib/kiwoom/quote-protocol";
import { issueKiwoomToken, kiwoomEndpoints } from "@/lib/kiwoom/quote-rest";

export interface KiwoomSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (ev: { data?: unknown }) => void): void;
}

type TickListener = (tick: KiwoomTick) => void;
type LoginWaiter = (ok: boolean) => void;

export interface QuoteHubOptions {
  connect?: (url: string) => KiwoomSocket | Promise<KiwoomSocket>;
  fetchToken?: () => Promise<string>;
  nowMs?: () => number;
  wsUrl?: string;
}

export interface KiwoomQuoteHub {
  subscribe(code: string, onTick: TickListener): () => void;
  whenLoggedIn(timeoutMs: number): Promise<boolean>;
  close(): void;
}

async function defaultConnect(url: string): Promise<KiwoomSocket> {
  if (typeof globalThis.WebSocket === "function") {
    return new WebSocket(url);
  }
  const undici = (await import("undici")) as { WebSocket?: typeof WebSocket };
  if (!undici.WebSocket) {
    throw new Error("WebSocket is not available in this Node.js");
  }
  return new undici.WebSocket(url);
}

async function messageText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
  return String(data ?? "");
}

export function createQuoteHub(opts: QuoteHubOptions = {}): KiwoomQuoteHub {
  const connect = opts.connect ?? defaultConnect;
  const fetchToken = opts.fetchToken ?? (() => issueKiwoomToken());
  const nowMs = opts.nowMs ?? Date.now;
  const wsUrl = opts.wsUrl ?? kiwoomEndpoints().ws;

  const codes = new Map<string, Set<TickListener>>();
  const loginWaiters: LoginWaiter[] = [];
  let socket: KiwoomSocket | null = null;
  let loggedIn = false;
  let connecting = false;
  let disposed = false;
  let suppressClose = false;
  let authFailed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let loginTimer: ReturnType<typeof setTimeout> | null = null;
  let loggedOnce = false;

  function flushWaiters(ok: boolean) {
    const pending = loginWaiters.splice(0, loginWaiters.length);
    for (const waiter of pending) waiter(ok);
  }

  function clearTimers() {
    if (retryTimer) clearTimeout(retryTimer);
    if (loginTimer) clearTimeout(loginTimer);
    retryTimer = null;
    loginTimer = null;
  }

  function scheduleRetry(auth: boolean) {
    if (disposed || codes.size === 0 || retryTimer) return;
    const delay = auth ? 60_000 : Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connecting = false;
      ensure();
    }, delay);
  }

  function stopSocket() {
    clearTimers();
    loggedIn = false;
    connecting = false;
    const current = socket;
    socket = null;
    if (!current) return;
    suppressClose = true;
    try {
      current.close();
    } catch {
      suppressClose = false;
    }
  }

  function sendFullReg() {
    if (!loggedIn || !socket || codes.size === 0) return;
    const items = [...codes.keys()].slice(0, 100);
    socket.send(buildRegMessage(items, "1"));
  }

  function failConnect(auth: boolean) {
    authFailed = auth;
    flushWaiters(false);
    stopSocket();
    scheduleRetry(auth);
  }

  async function connectFlow() {
    let token = "";
    try {
      token = await fetchToken();
    } catch (err) {
      connecting = false;
      const auth = true;
      if (!loggedOnce) {
        loggedOnce = true;
        const detail = err instanceof Error ? err.message : "token error";
        console.warn(
          `[kiwoom] 접근토큰 발급 실패. .env.local 의 앱키/시크릿키와 KIWOOM_QUOTE_HOST(real 또는 mock)를 확인하세요. (${detail})`
        );
      }
      failConnect(auth);
      return;
    }
    if (disposed || codes.size === 0) {
      connecting = false;
      return;
    }
    let opened: KiwoomSocket;
    try {
      opened = await connect(wsUrl);
    } catch (err) {
      connecting = false;
      const detail = err instanceof Error ? err.message : "connect error";
      console.warn(`[kiwoom] 시세 웹소켓 연결 실패 (${detail})`);
      failConnect(false);
      return;
    }
    if (disposed || codes.size === 0) {
      try {
        opened.close();
      } catch {
        /* already gone */
      }
      connecting = false;
      return;
    }
    socket = opened;
    opened.addEventListener("open", () => {
      if (socket !== opened) return;
      opened.send(buildLoginMessage(token));
      if (loginTimer) clearTimeout(loginTimer);
      loginTimer = setTimeout(() => {
        if (!loggedIn && socket === opened) failConnect(false);
      }, 10_000);
    });
    opened.addEventListener("message", (ev) => {
      void onMessage(opened, ev.data);
    });
    opened.addEventListener("error", () => {
      if (socket === opened && !loggedIn) failConnect(false);
    });
    opened.addEventListener("close", () => {
      if (suppressClose) {
        suppressClose = false;
        return;
      }
      if (socket === opened) socket = null;
      loggedIn = false;
      connecting = false;
      if (!disposed && codes.size > 0) scheduleRetry(false);
    });
  }

  async function onMessage(opened: KiwoomSocket, data: unknown) {
    if (socket !== opened) return;
    const text = await messageText(data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (isPingMessage(parsed)) {
      try {
        opened.send(text);
      } catch {
        /* socket closing */
      }
      return;
    }
    const row = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    if (!row) return;
    if (row.trnm === "LOGIN") {
      if (loginTimer) clearTimeout(loginTimer);
      loginTimer = null;
      const ok = row.return_code == null || row.return_code === 0 || row.return_code === "0";
      if (!ok) {
        authFailed = true;
        console.warn(
          "[kiwoom] 실시간 시세 로그인 실패. 앱키/시크릿키가 이 서버(real/mock)용인지 확인하세요."
        );
        failConnect(true);
        return;
      }
      loggedIn = true;
      connecting = false;
      authFailed = false;
      attempt = 0;
      loggedOnce = false;
      sendFullReg();
      flushWaiters(true);
      console.info(`[kiwoom] 실시간 시세 연결됨 (${codes.size}종목)`);
      return;
    }
    if (row.trnm === "REAL") {
      const nowSec = Math.floor(nowMs() / 1000);
      for (const tick of parseRealTicks(parsed, nowSec)) {
        const listeners = codes.get(tick.code);
        if (!listeners) continue;
        for (const fn of listeners) fn(tick);
      }
    }
  }

  function ensure() {
    if (disposed || loggedIn || connecting || codes.size === 0) return;
    connecting = true;
    authFailed = false;
    void connectFlow();
  }

  return {
    subscribe(code, onTick) {
      let set = codes.get(code);
      const first = !set || set.size === 0;
      if (!set) {
        set = new Set();
        codes.set(code, set);
      }
      set.add(onTick);
      if (loggedIn && socket && first) {
        socket.send(buildRegMessage([code], "0"));
      } else {
        ensure();
      }
      return () => {
        const current = codes.get(code);
        if (!current) return;
        current.delete(onTick);
        if (current.size > 0) return;
        codes.delete(code);
        if (loggedIn && socket) {
          try {
            socket.send(buildRemoveMessage([code]));
          } catch {
            /* closing */
          }
        }
        if (codes.size === 0) stopSocket();
      };
    },
    whenLoggedIn(timeoutMs: number) {
      if (loggedIn) return Promise.resolve(true);
      if (authFailed && !connecting) return Promise.resolve(false);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const idx = loginWaiters.indexOf(finish);
          if (idx >= 0) loginWaiters.splice(idx, 1);
          resolve(loggedIn);
        }, timeoutMs);
        const finish: LoginWaiter = (ok) => {
          clearTimeout(timer);
          resolve(ok);
        };
        loginWaiters.push(finish);
      });
    },
    close() {
      disposed = true;
      codes.clear();
      flushWaiters(false);
      stopSocket();
    },
  };
}

const globalHub = globalThis as typeof globalThis & {
  __chartdeskKiwoomHub?: KiwoomQuoteHub;
};

export function getKiwoomQuoteHub(): KiwoomQuoteHub {
  if (!globalHub.__chartdeskKiwoomHub) {
    globalHub.__chartdeskKiwoomHub = createQuoteHub();
  }
  return globalHub.__chartdeskKiwoomHub;
}

export function resetKiwoomQuoteHubForTests(): void {
  globalHub.__chartdeskKiwoomHub?.close();
  delete globalHub.__chartdeskKiwoomHub;
}
