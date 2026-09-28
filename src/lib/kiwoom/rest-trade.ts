import { normalizeItemCode, parseKiwoomAbs } from "@/lib/kiwoom/quote-protocol";
import { KiwoomQuoteError, kiwoomAuthorizedPost } from "@/lib/kiwoom/quote-rest";

export interface KiwoomPosition {
  code: string;
  name: string;
  qty: number;
  sellableQty: number;
  avgPrice: number | null;
  lastPrice: number | null;
  pnl: number | null;
}

export interface KiwoomAccountSnapshot {
  deposit: number | null;
  orderable: number | null;
  positions: KiwoomPosition[];
}

function signed(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/,/g, "");
  if (!s || s === "+" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function firstAbs(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in row)) continue;
    const n = parseKiwoomAbs(row[key]);
    if (n != null) return n;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positionRows(body: Record<string, unknown>): Record<string, unknown>[] {
  const keys = ["acnt_evlt_remn_indv_tot", "acnt_evlt_remn_indv", "stk_acnt_evlt_prst"];
  for (const key of keys) {
    const list = body[key];
    if (Array.isArray(list)) {
      return list.filter((row): row is Record<string, unknown> => asRecord(row) != null);
    }
  }
  for (const value of Object.values(body)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const first = asRecord(value[0]);
    if (first && ("stk_cd" in first || "stk_nm" in first)) {
      return value.filter((row): row is Record<string, unknown> => asRecord(row) != null);
    }
  }
  return [];
}

export function parseKiwoomAccount(
  depositBody: unknown,
  balanceBody: unknown
): KiwoomAccountSnapshot {
  const deposit = asRecord(depositBody) ?? {};
  const balance = asRecord(balanceBody) ?? {};
  const positions = positionRows(balance)
    .map((row) => {
      const code = normalizeItemCode(String(row.stk_cd ?? ""));
      if (!/^\d{6}$/.test(code)) return null;
      const qty = firstAbs(row, ["rmnd_qty", "hold_qty"]) ?? 0;
      if (qty <= 0) return null;
      const sellable = firstAbs(row, ["trde_able_qty", "ord_alow_qty"]) ?? qty;
      return {
        code,
        name: typeof row.stk_nm === "string" ? row.stk_nm.trim() : code,
        qty,
        sellableQty: sellable,
        avgPrice: firstAbs(row, ["pur_pric", "avg_prc"]),
        lastPrice: firstAbs(row, ["cur_prc", "now_prc"]),
        pnl: signed(row.evltv_prft ?? row.evlt_pl ?? row.prft_amt),
      } satisfies KiwoomPosition;
    })
    .filter((row): row is KiwoomPosition => row != null);

  return {
    deposit: firstAbs(deposit, ["entr", "dnca_tot_amt", "d2_entra"]),
    orderable: firstAbs(deposit, [
      "ord_alow_amt",
      "pymn_alow_amt",
      "100stk_ord_alow_amt",
      "d2_pymn_alow_amt",
      "ord_alowa",
    ]),
    positions,
  };
}

export async function fetchKiwoomAccount(): Promise<KiwoomAccountSnapshot> {
  const deposit = await kiwoomAuthorizedPost("/api/dostk/acnt", "kt00001", { qry_tp: "3" });
  const balance = await kiwoomAuthorizedPost("/api/dostk/acnt", "kt00018", {
    qry_tp: "1",
    dmst_stex_tp: "KRX",
  });
  return parseKiwoomAccount(deposit, balance);
}

export async function placeKiwoomCashOrder(input: {
  side: "buy" | "sell";
  code: string;
  qty: number;
  /** Omit for a market order. */
  price?: number;
}): Promise<{ orderNo: string }> {
  const qty = Math.trunc(input.qty);
  if (!/^\d{6}$/.test(input.code) || qty <= 0) {
    throw new KiwoomQuoteError("종목코드와 수량을 확인하세요");
  }
  const market = input.price == null;
  const body: Record<string, string> = {
    dmst_stex_tp: "KRX",
    stk_cd: input.code,
    ord_qty: String(qty),
    trde_tp: market ? "3" : "0",
    ord_uv: market ? "" : String(Math.round(input.price!)),
  };
  const apiId = input.side === "buy" ? "kt10000" : "kt10001";
  const json = await kiwoomAuthorizedPost("/api/dostk/ordr", apiId, body);
  const orderNo = String(json.ord_no ?? "").trim();
  if (!orderNo) throw new KiwoomQuoteError("주문번호가 없습니다");
  return { orderNo };
}

export async function cancelKiwoomOrder(input: {
  code: string;
  origOrderNo: string;
  qty: number;
}): Promise<void> {
  const qty = Math.trunc(input.qty);
  await kiwoomAuthorizedPost("/api/dostk/ordr", "kt10003", {
    dmst_stex_tp: "KRX",
    orig_ord_no: input.origOrderNo,
    stk_cd: input.code,
    cncl_qty: String(qty > 0 ? qty : 0),
  });
}
