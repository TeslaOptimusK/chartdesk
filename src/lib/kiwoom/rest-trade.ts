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
  /** Account bound to the app key. Null when ka00001 did not answer. */
  accountNo: string | null;
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
  let zero: number | null = null;
  for (const key of keys) {
    if (!(key in row)) continue;
    const n = parseKiwoomAbs(row[key]);
    if (n == null) continue;
    if (n !== 0) return n;
    zero = 0;
  }
  return zero;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readAccountNumber(body: unknown): string | null {
  const row = asRecord(body);
  if (!row) return null;
  const keys = ["acctNo", "acct_no", "acnt_no", "accno", "cano"];
  const piles: unknown[] = [row];
  for (const value of Object.values(row)) {
    if (Array.isArray(value)) piles.push(...value);
    else if (asRecord(value)) piles.push(value);
  }
  for (const pile of piles) {
    const item = asRecord(pile);
    if (!item) continue;
    for (const key of keys) {
      const value = item[key];
      if (typeof value === "string" && /\d{8,}/.test(value)) return value.trim();
      if (typeof value === "number" && String(Math.trunc(value)).length >= 8) return String(Math.trunc(value));
    }
  }
  return null;
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
  const balanceRaw = asRecord(balanceBody) ?? {};
  const nested = asRecord(balanceRaw.output) ?? asRecord(balanceRaw.output1);
  const balance =
    nested && positionRows(balanceRaw).length === 0 && positionRows(nested).length > 0
      ? { ...balanceRaw, ...nested }
      : balanceRaw;
  const positions = positionRows(balance)
    .map((row) => {
      const code = normalizeItemCode(String(row.stk_cd ?? ""));
      if (!/^\d{6}$/.test(code)) return null;
      const qty = firstAbs(row, ["rmnd_qty", "hold_qty"]) ?? 0;
      if (qty <= 0) return null;
      const sellable = firstAbs(row, ["trde_able_qty", "ord_alow_qty"]) ?? qty;
      const avgPrice = firstAbs(row, ["pur_pric", "avg_prc", "pchs_avg_pric"]);
      const lastPrice = firstAbs(row, ["cur_prc", "now_prc", "prpr"]);
      const reportedPnl = signed(row.evltv_prft ?? row.evlt_pl ?? row.pl_amt ?? row.prft_amt);
      const reportedRate = signed(row.prft_rt ?? row.pl_rt ?? row.evlt_rt ?? row.prft_rt_rt);
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
    accountNo: readAccountNumber(deposit) ?? readAccountNumber(balance),
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

function preferAmount(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (!present.length) return null;
  return present.find((value) => value !== 0) ?? 0;
}

/** One row per code. KRX and NXT copies of the same stock are not added together. */
export function mergeAccountSnapshots(parts: KiwoomAccountSnapshot[]): KiwoomAccountSnapshot {
  const byCode = new Map<string, KiwoomPosition>();
  for (const part of parts) {
    for (const row of part.positions) {
      const prev = byCode.get(row.code);
      const better =
        !prev ||
        row.qty > prev.qty ||
        (row.qty === prev.qty && (row.evalAmount ?? 0) > (prev.evalAmount ?? 0));
      if (better) byCode.set(row.code, { ...row });
    }
  }
  const positions = [...byCode.values()].sort(
    (a, b) => (b.evalAmount ?? 0) - (a.evalAmount ?? 0) || a.code.localeCompare(b.code)
  );
  const summedPurchase = positions.reduce((sum, row) => sum + (row.purchaseAmount ?? 0), 0);
  const summedEval = positions.reduce((sum, row) => sum + (row.evalAmount ?? 0), 0);
  const purchase = Math.max(preferAmount(parts.map((part) => part.summary.purchase)) ?? 0, summedPurchase);
  const evaluation = Math.max(preferAmount(parts.map((part) => part.summary.evaluation)) ?? 0, summedEval);
  const deposit = preferAmount(parts.map((part) => part.deposit));
  const reportedPnl = preferAmount(parts.map((part) => part.summary.pnl));
  const reportedAssets = preferAmount(parts.map((part) => part.summary.estimatedAssets));
  const pnl =
    purchase > 0 || evaluation > 0 ? evaluation - purchase : reportedPnl;
  const weightBase = evaluation > 0 ? evaluation : summedEval;
  for (const row of positions) {
    row.weightPct =
      row.evalAmount != null && weightBase > 0 ? (row.evalAmount / weightBase) * 100 : row.weightPct;
  }
  return {
    accountNo: parts.map((part) => part.accountNo).find((value) => value) ?? null,
    deposit,
    orderable: preferAmount(parts.map((part) => part.orderable)),
    summary: {
      purchase: purchase || preferAmount(parts.map((part) => part.summary.purchase)),
      evaluation: evaluation || preferAmount(parts.map((part) => part.summary.evaluation)),
      pnl,
      returnPct: positionReturnPct(
        purchase || null,
        evaluation || null,
        preferAmount(parts.map((part) => part.summary.returnPct))
      ),
      estimatedAssets: accountEstimatedAssets(
        deposit,
        evaluation > 0 ? evaluation : null,
        reportedAssets && reportedAssets > 0 ? reportedAssets : null
      ),
    },
    positions,
  };
}

async function readBalance(apiId: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    return await kiwoomAuthorizedPostAll("/api/dostk/acnt", apiId, body);
  } catch {
    return null;
  }
}

export async function fetchKiwoomAccount(): Promise<KiwoomAccountSnapshot> {
  const [depositEstimated, depositPlain, accountBody, krx18, nxt18, krx04, nxt04] = await Promise.all([
    kiwoomAuthorizedPost("/api/dostk/acnt", "kt00001", { qry_tp: "3" }),
    readBalance("kt00001", { qry_tp: "2" }),
    readBalance("ka00001", {}),
    readBalance("kt00018", { qry_tp: "1", dmst_stex_tp: "KRX" }),
    readBalance("kt00018", { qry_tp: "1", dmst_stex_tp: "NXT" }),
    readBalance("kt00004", { qry_tp: "0", dmst_stex_tp: "KRX" }),
    readBalance("kt00004", { qry_tp: "0", dmst_stex_tp: "NXT" }),
  ]);
  const accountNo = readAccountNumber(accountBody);
  const snaps = [krx18, nxt18, krx04, nxt04]
    .filter((body): body is Record<string, unknown> => body != null)
    .map((body) => parseKiwoomAccount(depositPlain ?? depositEstimated, body));
  snaps.push(parseKiwoomAccount(depositEstimated, {}));
  const merged = mergeAccountSnapshots(snaps);
  return { ...merged, accountNo: accountNo ?? merged.accountNo };
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
