export interface FillEvent {
  date: string;
  time: string;
  code: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
}

export interface OpenLot {
  date: string;
  qty: number;
  price: number;
}

export function classifyDeal(kind: string): "buy" | "sell" | null {
  const text = kind.replace(/\s/g, "");
  if (text.includes("매도")) return "sell";
  if (text.includes("매수")) return "buy";
  return null;
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
      lots.push({ date: event.date, qty: event.qty, price: event.price });
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
