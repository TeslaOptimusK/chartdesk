import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { getKiwoomQuoteHub } from "@/lib/kiwoom/quote-hub";
import { kiwoomQuotesConfigured } from "@/lib/kiwoom/quote-rest";
import {
  cancelKiwoomOrder,
  fetchKiwoomAccount,
  placeKiwoomCashOrder,
} from "@/lib/kiwoom/rest-trade";
import { writeJsonAtomic } from "@/lib/storage";

const FILE = path.join(process.cwd(), "data", "kiwoom-brackets.json");

export interface BracketOrderRef {
  orderNo: string;
  qty: number;
}

export interface KiwoomBracket {
  id: string;
  symbolId: string;
  code: string;
  /** Shares this watcher may still sell. */
  qty: number;
  takeProfit: number | null;
  stopLoss: number | null;
  /** Chart line for the fill. Null until the line is dragged off the broker average. */
  entryPrice?: number | null;
  /** Resting scale-in buys. Cancelled when the stop hits. */
  orderNos: BracketOrderRef[];
  armed: boolean;
  firing: boolean;
  /** Price ran through the target before any shares were held. Wait until it comes back inside. */
  waitInside: boolean;
  createdAt: number;
}

interface BracketRuntime {
  mem: KiwoomBracket[] | null;
  writing: Promise<void>;
  booted: boolean;
  unsubs: Map<string, () => void>;
  /** Failed sells per bracket id, and when the next attempt may run. */
  failures: Map<string, number>;
  retryAt: Map<string, number>;
}

/**
 * A dev reload or a second route bundle must not get its own copy of the
 * watcher, or a released bracket could still sell from the stale copy.
 */
const runtime: BracketRuntime = ((
  globalThis as typeof globalThis & { __chartdeskBrackets?: BracketRuntime }
).__chartdeskBrackets ??= {
  mem: null,
  writing: Promise.resolve(),
  booted: false,
  unsubs: new Map(),
  failures: new Map(),
  retryAt: new Map(),
});

/** Ticks arrive many times a second; a failing sell must not be retried on each one. */
export function sellRetryDelayMs(failures: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, failures - 1));
}

export function bracketAction(
  price: number,
  bracket: Pick<KiwoomBracket, "armed" | "firing" | "takeProfit" | "stopLoss">
): "stop" | "take" | null {
  if (!bracket.armed || bracket.firing) return null;
  if (!Number.isFinite(price)) return null;
  if (bracket.stopLoss != null && price <= bracket.stopLoss) return "stop";
  if (bracket.takeProfit != null && price >= bracket.takeProfit) return "take";
  return null;
}

async function load(): Promise<KiwoomBracket[]> {
  if (runtime.mem) return runtime.mem;
  let rows: KiwoomBracket[] = [];
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    rows = Array.isArray(parsed) ? (parsed as KiwoomBracket[]) : [];
  } catch {
    rows = [];
  }
  runtime.mem ??= rows;
  return runtime.mem;
}

function persist(): void {
  const snapshot = runtime.mem
    ? runtime.mem.map((row) => ({ ...row, orderNos: row.orderNos.map((o) => ({ ...o })) }))
    : [];
  runtime.writing = runtime.writing
    .then(async () => {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await writeJsonAtomic(FILE, snapshot);
    })
    .catch((err) => {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[kiwoom] 목표가/손절 감시 저장 실패 (${detail})`);
    });
}

export async function listBrackets(): Promise<KiwoomBracket[]> {
  return (await load()).map((row) => ({ ...row, orderNos: [...row.orderNos] }));
}

/** Keep a long bracket on the correct side of the fill. */
export function separateLongLevels(
  entry: number,
  takeProfit: number | null,
  stopLoss: number | null
): { entry: number; takeProfit: number | null; stopLoss: number | null } {
  return {
    entry,
    takeProfit: takeProfit != null && takeProfit > entry ? takeProfit : null,
    stopLoss: stopLoss != null && stopLoss < entry ? stopLoss : null,
  };
}

export async function updateBracketLevels(input: {
  symbolId: string;
  code: string;
  qty: number;
  entryPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
}): Promise<KiwoomBracket> {
  const rows = await load();
  const levels =
    input.entryPrice != null
      ? separateLongLevels(input.entryPrice, input.takeProfit, input.stopLoss)
      : {
          entry: input.entryPrice,
          takeProfit: input.takeProfit,
          stopLoss: input.stopLoss,
        };
  let row = rows.find(
    (b) => b.armed && (b.symbolId === input.symbolId || b.code === input.code)
  );
  if (!row) {
    row = {
      id: randomUUID(),
      symbolId: input.symbolId,
      code: input.code,
      qty: Math.max(1, Math.trunc(input.qty) || 1),
      takeProfit: levels.takeProfit,
      stopLoss: levels.stopLoss,
      entryPrice: levels.entry,
      orderNos: [],
      armed: true,
      firing: false,
      waitInside: true,
      createdAt: Date.now(),
    };
    rows.push(row);
  } else {
    row.entryPrice = levels.entry;
    row.takeProfit = levels.takeProfit;
    row.stopLoss = levels.stopLoss;
    if (input.qty > 0) row.qty = Math.trunc(input.qty);
    row.waitInside = true;
    row.firing = false;
  }
  persist();
  await runtime.writing;
  syncSubs();
  return { ...row, orderNos: row.orderNos.map((o) => ({ ...o })) };
}

export async function armBracket(input: {
  symbolId: string;
  code: string;
  qty: number;
  takeProfit: number | null;
  stopLoss: number | null;
  orderNos: BracketOrderRef[];
}): Promise<KiwoomBracket> {
  const rows = await load();
  const bracket: KiwoomBracket = {
    id: randomUUID(),
    symbolId: input.symbolId,
    code: input.code,
    qty: input.qty,
    takeProfit: input.takeProfit,
    stopLoss: input.stopLoss,
    orderNos: input.orderNos,
    armed: true,
    firing: false,
    waitInside: false,
    createdAt: Date.now(),
  };
  rows.push(bracket);
  persist();
  await runtime.writing;
  return bracket;
}

export async function disarmBracket(id: string): Promise<boolean> {
  const rows = await load();
  const row = rows.find((b) => b.id === id);
  if (!row) return false;
  row.armed = false;
  row.firing = false;
  persist();
  await runtime.writing;
  syncSubs();
  return true;
}

export async function cancelBracketOrders(id: string): Promise<{ cancelled: number; failed: number }> {
  const rows = await load();
  const row = rows.find((b) => b.id === id);
  if (!row) return { cancelled: 0, failed: 0 };
  let cancelled = 0;
  let failed = 0;
  for (const order of [...row.orderNos]) {
    try {
      await cancelKiwoomOrder({ code: row.code, origOrderNo: order.orderNo, qty: order.qty });
      cancelled += 1;
    } catch {
      failed += 1;
    }
  }
  if (failed === 0) row.orderNos = [];
  persist();
  await runtime.writing;
  return { cancelled, failed };
}

function priceOutside(bracket: KiwoomBracket, price: number): boolean {
  if (bracket.stopLoss != null && price <= bracket.stopLoss) return true;
  if (bracket.takeProfit != null && price >= bracket.takeProfit) return true;
  return false;
}

async function fireBracket(bracket: KiwoomBracket, action: "stop" | "take"): Promise<void> {
  if (action === "stop") {
    for (const order of [...bracket.orderNos]) {
      try {
        await cancelKiwoomOrder({
          code: bracket.code,
          origOrderNo: order.orderNo,
          qty: order.qty,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "cancel failed";
        console.warn(`[kiwoom] 손절 전 미체결 취소 실패 ${bracket.code} (${detail})`);
      }
    }
    bracket.orderNos = [];
  }

  const account = await fetchKiwoomAccount();
  const held = account.positions.find((p) => p.code === bracket.code);
  const sellable = Math.floor(held?.sellableQty ?? held?.qty ?? 0);
  const qty = Math.min(bracket.qty, sellable);

  if (qty <= 0) {
    bracket.firing = false;
    if (action === "stop") {
      bracket.armed = false;
      bracket.waitInside = false;
    } else {
      bracket.armed = true;
      bracket.waitInside = true;
    }
    persist();
    await runtime.writing;
    return;
  }

  await placeKiwoomCashOrder({ side: "sell", code: bracket.code, qty });
  bracket.qty -= qty;
  bracket.firing = false;
  if (action === "stop" || bracket.qty <= 0) {
    bracket.armed = false;
    bracket.waitInside = false;
  } else {
    bracket.armed = true;
    bracket.waitInside = true;
  }
  persist();
  await runtime.writing;
}

function onTick(code: string, price: number): void {
  const rows = runtime.mem ?? [];
  const now = Date.now();
  for (const bracket of rows) {
    if (bracket.code !== code || !bracket.armed || bracket.firing) continue;
    if (now < (runtime.retryAt.get(bracket.id) ?? 0)) continue;
    if (bracket.waitInside) {
      if (priceOutside(bracket, price)) continue;
      bracket.waitInside = false;
    }
    const action = bracketAction(price, bracket);
    if (!action) continue;
    bracket.firing = true;
    persist();
    void fireBracket(bracket, action)
      .then(() => {
        runtime.failures.delete(bracket.id);
        runtime.retryAt.delete(bracket.id);
      })
      .catch((err) => {
        bracket.firing = false;
        bracket.armed = true;
        persist();
        const failures = (runtime.failures.get(bracket.id) ?? 0) + 1;
        const delay = sellRetryDelayMs(failures);
        runtime.failures.set(bracket.id, failures);
        runtime.retryAt.set(bracket.id, Date.now() + delay);
        const detail = err instanceof Error ? err.message : "order failed";
        console.warn(
          `[kiwoom] 목표가/손절 매도 실패 ${code} (${detail}). ${Math.round(delay / 1000)}초 뒤 다시 시도합니다.`
        );
      });
  }
}

function syncSubs(): void {
  const wanted = new Set((runtime.mem ?? []).filter((b) => b.armed).map((b) => b.code));
  for (const [code, stop] of runtime.unsubs) {
    if (wanted.has(code)) continue;
    stop();
    runtime.unsubs.delete(code);
  }
  if (!kiwoomQuotesConfigured()) return;
  const hub = getKiwoomQuoteHub();
  for (const code of wanted) {
    if (!/^\d{6}$/.test(code) || runtime.unsubs.has(code)) continue;
    runtime.unsubs.set(
      code,
      hub.subscribe(code, (tick) => {
        if (tick.price != null && Number.isFinite(tick.price)) onTick(code, tick.price);
      })
    );
  }
}

export async function resumeBracketWatcher(): Promise<void> {
  if (!kiwoomQuotesConfigured()) return;
  const rows = await load();
  if (!runtime.booted) {
    runtime.booted = true;
    for (const row of rows) {
      if (row.firing) row.firing = false;
    }
    persist();
    await runtime.writing;
  }
  if (!rows.some((b) => b.armed)) return;
  syncSubs();
}

export function resetBracketsForTests(): void {
  for (const stop of runtime.unsubs.values()) stop();
  runtime.unsubs.clear();
  runtime.failures.clear();
  runtime.retryAt.clear();
  runtime.mem = null;
  runtime.booted = false;
  runtime.writing = Promise.resolve();
}
