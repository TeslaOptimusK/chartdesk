/** Even KRX limit ladder inside a price band. */

export interface ScaleSlice {
  price: number;
  qty: number;
}

/** KRX cash-equity tick. Boundaries belong to the wider tick. */
export function krxTickSize(price: number): number {
  const p = Math.abs(price);
  if (p < 2_000) return 1;
  if (p < 5_000) return 5;
  if (p < 20_000) return 10;
  if (p < 50_000) return 50;
  if (p < 200_000) return 100;
  if (p < 500_000) return 500;
  return 1_000;
}

export function roundToTick(
  price: number,
  mode: "down" | "nearest" | "up" = "nearest"
): number {
  const tick = krxTickSize(price);
  const q = price / tick;
  const n =
    mode === "down"
      ? Math.floor(q + 1e-9)
      : mode === "up"
        ? Math.ceil(q - 1e-9)
        : Math.round(q);
  return n * tick;
}

/** Tradable prices from `low` through `high`, inclusive, walking the tick schedule. */
export function tradablePrices(low: number, high: number): number[] {
  const lo = roundToTick(Math.min(low, high), "up");
  const hi = roundToTick(Math.max(low, high), "down");
  if (!(lo > 0) || hi < lo) return [];
  const out: number[] = [];
  let price = lo;
  while (price <= hi + 1e-6 && out.length < 20_000) {
    out.push(price);
    const next = price + krxTickSize(price);
    if (next <= price) break;
    price = next;
  }
  return out;
}

/**
 * Inclusive equal spacing across the band.
 * Remainder shares go to the higher prices (closer to the market, first to fill).
 * Returned high-to-low so the first slice is the one most likely to trade.
 */
export function buildScaleInOrders(
  low: number,
  high: number,
  splits: number,
  totalQty: number
): ScaleSlice[] {
  const n = Math.trunc(splits);
  const qty = Math.trunc(totalQty);
  if (!Number.isFinite(low) || !Number.isFinite(high) || !Number.isFinite(splits) || !Number.isFinite(totalQty)) {
    throw new Error("분할 입력을 확인하세요");
  }
  if (n < 2 || n > 20) throw new Error("분할은 2에서 20 사이로 입력하세요");
  if (qty < n) throw new Error("수량은 분할 수 이상이어야 합니다");
  if (!(low > 0) || !(high > 0)) throw new Error("가격 범위를 확인하세요");

  const ticks = tradablePrices(low, high);
  if (ticks.length < n) {
    throw new Error(
      ticks.length < 2
        ? "가격 범위가 너무 좁습니다"
        : `이 범위의 호가는 ${ticks.length}개입니다. 범위를 넓히거나 분할 수를 줄이세요`
    );
  }

  const picked: number[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let idx = Math.round((i * (ticks.length - 1)) / (n - 1));
    while (used.has(idx) && idx < ticks.length - 1) idx += 1;
    while (used.has(idx) && idx > 0) idx -= 1;
    if (used.has(idx)) throw new Error("가격 범위가 너무 좁습니다");
    used.add(idx);
    picked.push(ticks[idx]!);
  }

  const base = Math.floor(qty / n);
  let rem = qty - base * n;
  return [...picked].sort((a, b) => b - a).map((price) => {
    const sliceQty = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return { price, qty: sliceQty };
  });
}
