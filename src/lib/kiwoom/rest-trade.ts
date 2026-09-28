import { normalizeItemCode, parseKiwoomAbs } from "@/lib/kiwoom/quote-protocol";
import {
  KiwoomQuoteError,
  kiwoomAuthorizedPost,
  kiwoomAuthorizedPostAll,
} from "@/lib/kiwoom/quote-rest";

export interface KiwoomPosition {
  code: string;
  name: string;
  qty: number;
  sellableQty: number;
  avgPrice: number | null;
  lastPrice: number | null;
  /** (현재가-매수가)×수량 when both prices exist, otherwise the broker figure. */
  pnl: number | null;
  /** Percent vs average cost. Matches 매수가/현재가 when both exist. */
  returnPct: number | null;
  /** 매입금액. Broker figure, else 매수가×수량. */
  purchaseAmount: number | null;
  /** 평가금액. Broker figure, else 현재가×수량. */
  evalAmount: number | null;
  /** Share of the account's evaluated stocks. */
  weightPct: number | null;
}

export interface KiwoomHoldingsSummary {
  purchase: number | null;
  evaluation: number | null;
  pnl: number | null;
  returnPct: number | null;
  /** 추정예탁자산. Broker figure, else 예수금+평가금액. */
  estimatedAssets: number | null;
}

export interface KiwoomAccountSnapshot {
  deposit: number | null;
  orderable: number | null;
  summary: KiwoomHoldingsSummary;
  positions: KiwoomPosition[];
}

function signed(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/,/g, "").replace(/%$/, "");
  if (!s || s === "+" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Yield that matches the two prices on screen. Reported rate is only a fallback. */
export function positionReturnPct(
  avgPrice: number | null,
  lastPrice: number | null,
  reported: number | null = null
): number | null {
  if (avgPrice != null && avgPrice > 0 && lastPrice != null && lastPrice > 0) {
    return ((lastPrice - avgPrice) / avgPrice) * 100;
  }
  return reported;
}

export function accountEstimatedAssets(
  deposit: number | null,
  evaluation: number | null,
  reported: number | null
): number | null {
  if (reported != null) return reported;
  if (deposit != null && evaluation != null) return deposit + evaluation;
  return evaluation ?? deposit;
}

function holdingsSummary(body: Record<string, unknown>): Omit<KiwoomHoldingsSummary, "estimatedAssets"> {
  const purchase = firstAbs(body, ["tot_pur_amt", "pchs_amt"]);
  const evaluation = firstAbs(body, ["tot_evlt_amt", "evlt_amt_tot"]);
  const pnl = signed(body.tot_evlt_pl ?? body.tot_evltv_prft);
  const reported = signed(body.tot_prft_rt ?? body.tot_prft_rt_rt);
  return {
    purchase,
    evaluation,
    pnl:
      pnl ??
      (purchase != null && evaluation != null ? evaluation - purchase : null),
    returnPct: positionReturnPct(purchase, evaluation, reported),
  };
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
      const avgPrice = firstAbs(row, ["pur_pric", "avg_prc", "pchs_avg_pric"]);
      const lastPrice = firstAbs(row, ["cur_prc", "now_prc", "prpr"]);
      const reportedPnl = signed(row.evltv_prft ?? row.evlt_pl ?? row.prft_amt);
      const reportedRate = signed(row.prft_rt ?? row.evlt_rt ?? row.prft_rt_rt);
      const purchaseAmount =
        firstAbs(row, ["pur_amt", "pchs_amt", "buy_amt"]) ??
        (avgPrice != null ? avgPrice * qty : null);
      const evalAmount =
        firstAbs(row, ["evlt_amt", "evlu_amt"]) ??
        (lastPrice != null ? lastPrice * qty : null);
      return {
        code,
        name: typeof row.stk_nm === "string" ? row.stk_nm.trim() : code,
        qty,
        sellableQty: sellable,
        avgPrice,
        lastPrice,
        pnl:
          avgPrice != null && lastPrice != null
            ? (lastPrice - avgPrice) * qty
            : reportedPnl,
        returnPct: positionReturnPct(avgPrice, lastPrice, reportedRate),
        purchaseAmount,
        evalAmount,
        weightPct: null as number | null,
      } satisfies KiwoomPosition;
    })
    .filter((row): row is KiwoomPosition => row != null);

  const summaryBase = holdingsSummary(balance);
  const depositAmount = firstAbs(deposit, ["entr", "dnca_tot_amt", "d2_entra"]);
  const weightBase =
    summaryBase.evaluation ??
    positions.reduce((sum, row) => sum + (row.evalAmount ?? 0), 0);
  for (const row of positions) {
    row.weightPct =
      row.evalAmount != null && weightBase > 0 ? (row.evalAmount / weightBase) * 100 : null;
  }
  positions.sort(
    (a, b) => (b.evalAmount ?? 0) - (a.evalAmount ?? 0) || a.code.localeCompare(b.code)
  );

  return {
    deposit: depositAmount,
    orderable: firstAbs(deposit, [
      "ord_alow_amt",
      "pymn_alow_amt",
      "100stk_ord_alow_amt",
      "d2_pymn_alow_amt",
      "ord_alowa",
    ]),
    summary: {
      ...summaryBase,
      estimatedAssets: accountEstimatedAssets(
        depositAmount,
        summaryBase.evaluation,
        firstAbs(balance, ["prsm_dpst_aset_amt", "asum_aset_amt"])
      ),
    },
    positions,
  };
}

let usdKrwCache: { rate: number; at: number } | null = null;

/** Won per 1 USD. Null when the quote is missing or outside a sane range. */
export async function fetchUsdKrw(): Promise<number | null> {
  const now = Date.now();
  if (usdKrwCache && now - usdKrwCache.at < 10 * 60_000) return usdKrwCache.rate;
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=1d",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ChartDesk/1.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      }
    );
    if (!res.ok) return usdKrwCache?.rate ?? null;
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const rate = json.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (rate == null || rate < 800 || rate > 2500) return usdKrwCache?.rate ?? null;
    usdKrwCache = { rate, at: now };
    return rate;
  } catch {
    return usdKrwCache?.rate ?? null;
  }
}

export function krwToUsd(krw: number | null, usdKrw: number | null): number | null {
  if (krw == null || usdKrw == null || usdKrw <= 0) return null;
  return krw / usdKrw;
}

export async function fetchKiwoomAccount(): Promise<KiwoomAccountSnapshot> {
  const deposit = await kiwoomAuthorizedPost("/api/dostk/acnt", "kt00001", { qry_tp: "3" });
  const balance = await kiwoomAuthorizedPostAll("/api/dostk/acnt", "kt00018", {
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
