export interface FillEvent {
  date: string;
  time: string;
  code: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  /** Broker deal number, used to skip the same row on a later page. */
  dealNo?: string;
}

export interface OpenLot {
  date: string;
  time?: string;
  qty: number;
  price: number;
}

export function classifyDeal(kind: string): "buy" | "sell" | null {
  const text = kind.replace(/\s/g, "");
  if (!text || text.includes("취소") || text.includes("정정")) return null;
  if (/매도|sell/i.test(text)) return "sell";
  if (/매수|buy/i.test(text)) return "buy";
  return null;
}

/** Map a ledger ticker and a history ticker onto the same lot key. */
export function lotKey(code: string): string {
  const cleaned = code.toUpperCase().replace(/\s+/g, "");
  const tail = cleaned.split(/[^A-Z0-9.]+/).filter(Boolean).pop() ?? cleaned;
  return tail.replace(/\.(O|N|A|K|Q)$/, "");
}

/** Buys still open after later sells, oldest first. */
export function openLotsFromFills(events: FillEvent[]): Map<string, OpenLot[]> {
  const sorted = [...events].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );
  const books = new Map<string, OpenLot[]>();
  for (const event of sorted) {
    if (event.qty <= 0 || event.price <= 0) continue;
    const lots = books.get(event.code) ?? [];
    if (event.side === "buy") {
      lots.push({ date: event.date, time: event.time, qty: event.qty, price: event.price });
      books.set(event.code, lots);
      continue;
    }
    let left = event.qty;
    while (left > 0 && lots.length) {
      const lot = lots[0]!;
      const take = Math.min(lot.qty, left);
      lot.qty = roundQty(lot.qty - take);
      left = roundQty(left - take);
      if (lot.qty <= 0) lots.shift();
    }
    books.set(event.code, lots);
  }
  return books;
}

function roundQty(qty: number): number {
  return Math.round(qty * 10000) / 10000;
}

/**
 * History can be shorter than the holding. The remainder keeps the broker average
 * intact. Extra history quantity is dropped from the oldest lots.
 */
export function reconcileLots(
  lots: OpenLot[],
  positionQty: number,
  avgPrice: number | null
): OpenLot[] {
  const qty = roundQty(positionQty);
  if (qty <= 0) return [];
  const kept = lots
    .filter((lot) => lot.qty > 0 && lot.price > 0)
    .map((lot) => ({ ...lot }));
  let have = roundQty(kept.reduce((sum, lot) => sum + lot.qty, 0));
  while (have > qty + 1e-6 && kept.length) {
    const extra = roundQty(have - qty);
    const oldest = kept[0]!;
    if (oldest.qty <= extra) {
      have = roundQty(have - oldest.qty);
      kept.shift();
    } else {
      oldest.qty = roundQty(oldest.qty - extra);
      have = qty;
    }
  }
  if (have < qty - 1e-6) {
    const missing = roundQty(qty - have);
    const knownCost = kept.reduce((sum, lot) => sum + lot.price * lot.qty, 0);
    const target = avgPrice != null && avgPrice > 0 ? avgPrice * qty : knownCost;
    const price = missing > 0 ? Math.max(0.01, (target - knownCost) / missing) : avgPrice ?? 0;
    kept.unshift({ date: "", qty: missing, price });
  }
  return kept;
}

/** Same fill price shares one row. The undated remainder stays on its own. */
export function groupLotsByPrice(lots: OpenLot[]): OpenLot[] {
  const grouped: OpenLot[] = [];
  const index = new Map<string, OpenLot>();
  for (const lot of lots) {
    if (!lot.date) {
      grouped.push({ ...lot });
      continue;
    }
    const key = lot.price.toFixed(4);
    const prev = index.get(key);
    if (!prev) {
      const copy = { ...lot };
      index.set(key, copy);
      grouped.push(copy);
      continue;
    }
    prev.qty = roundQty(prev.qty + lot.qty);
    if (lot.date < prev.date) {
      prev.date = lot.date;
      prev.time = lot.time;
    }
  }
  return grouped;
}

/** True when every holding is explained by the fills gathered so far. */
export function lotsCover(
  events: FillEvent[],
  positions: { code: string; qty: number }[]
): boolean {
  if (!positions.length) return true;
  const books = openLotsFromFills(events);
  return positions.every((position) => {
    const have = (books.get(lotKey(position.code)) ?? []).reduce((sum, lot) => sum + lot.qty, 0);
    return have + 1e-6 >= position.qty;
  });
}

/**
 * ust21100 rejects a span longer than about three months. Windows are inclusive
 * and do not share a day.
 */
export function historyWindows(
  horizonDays: number,
  spanDays: number
): { startAgo: number; endAgo: number }[] {
  const horizon = Math.max(1, Math.trunc(horizonDays));
  const span = Math.max(1, Math.trunc(spanDays));
  const windows: { startAgo: number; endAgo: number }[] = [];
  for (let endAgo = 0; endAgo < horizon; endAgo += span) {
    const startAgo = Math.min(horizon - 1, endAgo + span - 1);
    windows.push({ startAgo, endAgo });
    if (startAgo >= horizon - 1) break;
  }
  return windows;
}
