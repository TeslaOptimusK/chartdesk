import { normalizeItemCode, parseKiwoomAbs } from "@/lib/kiwoom/quote-protocol";
import {
  classifyDeal,
  historyWindows,
  lotKey,
  lotsCover,
  groupLotsByPrice,
  openLotsFromFills,
  reconcileLots,
  type FillEvent,
} from "@/lib/kiwoom/lots";
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
  /** Quote currency. Domestic rows are KRW. US ledger rows keep the broker currency. */
  currency: string;
  avgPrice: number | null;
  lastPrice: number | null;
  /** (현재가-매수가)×수량 when both prices exist, otherwise the broker figure. */
  pnl: number | null;
  /** Percent vs average cost. Matches 매수가/현재가 when both exist. */
  returnPct: number | null;
  /** 매입금액 in `currency`. Broker figure, else 매수가×수량. */
  purchaseAmount: number | null;
  /** 평가금액 in `currency`. Broker figure, else 현재가×수량. */
  evalAmount: number | null;
  /** Won translation from the US ledger. Domestic rows repeat the won figures. */
  krwAvgPrice: number | null;
  krwLastPrice: number | null;
  krwPurchaseAmount: number | null;
  krwEvalAmount: number | null;
  krwPnl: number | null;
  /** Broker exchange rate on a US row. */
  fxRate: number | null;
  /** Share of the account's evaluated stocks, in won. */
  weightPct: number | null;
  /** US board for a sell: ND NASDAQ, NY NYSE, NA AMEX. */
  venue?: "ND" | "NY" | "NA";
  /** Open buy lots, oldest first. Empty when the broker did not return fills. */
  lots?: { date: string; time?: string; qty: number; price: number }[];
}

export interface KiwoomFxCash {
  currency: string;
  deposit: number | null;
  evalAmount: number | null;
  rate: number | null;
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
  /** Foreign cash from ust21120. Empty for a domestic-only read. */
  fxCash: KiwoomFxCash[];
  /** Set when US trade history could not be read, so lots stay on the average. */
  historyNote?: string | null;
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

/** A tiny reported total must not hide a real stock evaluation. */
export function reportedAssetsIfComplete(
  reported: number | null,
  evaluation: number
): number | null {
  if (reported == null || reported <= 0) return null;
  if (evaluation > 0 && reported < evaluation) return null;
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

/**
 * ka00001 `acctNo` is 8 account digits plus a 2-digit product code.
 * The app-key screen shows `5842-0740 [위탁종합]`; the API returns `5842074010`.
 * Product 10 is that 위탁종합 book.
 */
const KIWOOM_PRODUCT_LABEL: Record<string, string> = {
  "10": "위탁종합",
};

export function formatKiwoomAccountNo(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 10) return trimmed || null;
  const head = `${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
  const product = digits.slice(8);
  const label = KIWOOM_PRODUCT_LABEL[product];
  return label ? `${head} ${label}` : `${head}-${product}`;
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
      const pnl =
        avgPrice != null && lastPrice != null
          ? (lastPrice - avgPrice) * qty
          : reportedPnl;
      return {
        code,
        name: typeof row.stk_nm === "string" ? row.stk_nm.trim() : code,
        qty,
        sellableQty: sellable,
        currency: "KRW",
        avgPrice,
        lastPrice,
        pnl,
        returnPct: positionReturnPct(avgPrice, lastPrice, reportedRate),
        purchaseAmount,
        evalAmount,
        krwAvgPrice: avgPrice,
        krwLastPrice: lastPrice,
        krwPurchaseAmount: purchaseAmount,
        krwEvalAmount: evalAmount,
        krwPnl: pnl,
        fxRate: null as number | null,
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
    fxCash: [],
  };
}

function wonBook(currency: string, native: number | null, krw: number | null): number {
  if (krw != null) return krw;
  if (currency === "KRW") return native ?? 0;
  return 0;
}

export function usBoard(name: unknown): "ND" | "NY" | "NA" {
  const text = String(name ?? "").toUpperCase();
  if (text.includes("NYSE") || text.includes("뉴욕")) return "NY";
  if (text.includes("AMEX") || text.includes("아멕스")) return "NA";
  return "ND";
}

function usTicker(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** ust21070 미국주식 원장잔고확인. Row prices stay in the quote currency. */
export function parseUsLedger(body: unknown): KiwoomAccountSnapshot {
  const root = asRecord(body) ?? {};
  const list = Array.isArray(root.result_list) ? root.result_list : [];
  const positions = list
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const code = usTicker(row.stk_cd);
      if (!code || code === "000000") return null;
      const qty = firstAbs(row, ["poss_qty", "qty"]) ?? 0;
      if (qty <= 0) return null;
      const currency = usTicker(row.crnc_code) || "USD";
      const avgPrice = firstAbs(row, ["frgn_stk_book_uv"]);
      const lastPrice = firstAbs(row, ["now_pric"]);
      const purchaseAmount =
        firstAbs(row, ["frgn_stk_book_amt"]) ??
        (avgPrice != null ? avgPrice * qty : null);
      const evalAmount =
        firstAbs(row, ["evlt_amt"]) ?? (lastPrice != null ? lastPrice * qty : null);
      const reportedPnl = signed(row.pl_amt);
      const pnl =
        avgPrice != null && lastPrice != null ? (lastPrice - avgPrice) * qty : reportedPnl;
      const name =
        typeof row.frgn_stk_nm === "string" && row.frgn_stk_nm.trim()
          ? row.frgn_stk_nm.trim()
          : code;
      return {
        code,
        name,
        qty,
        sellableQty: firstAbs(row, ["sell_alowq"]) ?? qty,
        currency,
        avgPrice,
        lastPrice,
        pnl,
        returnPct: positionReturnPct(avgPrice, lastPrice, signed(row.pl_rt)),
        purchaseAmount,
        evalAmount,
        krwAvgPrice: firstAbs(row, ["frgn_stk_book_uv_krw"]),
        krwLastPrice: firstAbs(row, ["now_pric_krw"]),
        krwPurchaseAmount: firstAbs(row, ["frgn_stk_book_amt_krw"]),
        krwEvalAmount: firstAbs(row, ["evlt_amt_krw"]),
        krwPnl: signed(row.pl_amt_krw),
        fxRate: firstAbs(row, ["exch_rate"]),
        weightPct: null as number | null,
        venue: usBoard(row.stex_nm),
        lots: [] as { date: string; time?: string; qty: number; price: number }[],
      } as KiwoomPosition;
    })
    .filter((row): row is KiwoomPosition => row != null);

  const purchase = firstAbs(root, ["tot_prch_amt_krw"]);
  const evaluation = firstAbs(root, ["tot_evlt_amt_krw"]);
  const pnl = signed(root.tot_pl_amt_krw);
  return {
    accountNo: null,
    deposit: null,
    orderable: null,
    summary: {
      purchase,
      evaluation,
      pnl: pnl ?? (purchase != null && evaluation != null ? evaluation - purchase : null),
      returnPct: positionReturnPct(purchase, evaluation, signed(root.tot_pl_rt)),
      estimatedAssets: null,
    },
    positions,
    fxCash: [],
  };
}

/** ust21120 통화별 예수금 및 증권 평가금. `aset_evlt_amt` is the won estimate. */
export function parseUsValuation(body: unknown): KiwoomAccountSnapshot {
  const root = asRecord(body) ?? {};
  const list = Array.isArray(root.result_list) ? root.result_list : [];
  const fxCash = list
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const currency = usTicker(row.crnc_code);
      if (!currency || currency === "KRW") return null;
      return {
        currency,
        deposit: firstAbs(row, ["fx_entr"]),
        evalAmount: firstAbs(row, ["evlt_amt"]),
        rate: firstAbs(row, ["crnc_rt"]),
      } satisfies KiwoomFxCash;
    })
    .filter((row): row is KiwoomFxCash => row != null);
  return {
    accountNo: null,
    deposit: firstAbs(root, ["won_entr"]),
    orderable: null,
    summary: {
      purchase: null,
      evaluation: null,
      pnl: null,
      returnPct: null,
      estimatedAssets: firstAbs(root, ["aset_evlt_amt"]),
    },
    positions: [],
    fxCash,
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
      const key = `${row.currency}:${row.code}`;
      const prev = byCode.get(key);
      const better =
        !prev ||
        row.qty > prev.qty ||
        (row.qty === prev.qty &&
          wonBook(row.currency, row.evalAmount, row.krwEvalAmount) >
            wonBook(prev.currency, prev.evalAmount, prev.krwEvalAmount));
      if (better) byCode.set(key, { ...row });
    }
  }
  const positions = [...byCode.values()].sort(
    (a, b) =>
      wonBook(b.currency, b.evalAmount, b.krwEvalAmount) -
        wonBook(a.currency, a.evalAmount, a.krwEvalAmount) || a.code.localeCompare(b.code)
  );
  const summedPurchase = positions.reduce(
    (sum, row) => sum + wonBook(row.currency, row.purchaseAmount, row.krwPurchaseAmount),
    0
  );
  const summedEval = positions.reduce(
    (sum, row) => sum + wonBook(row.currency, row.evalAmount, row.krwEvalAmount),
    0
  );
  const purchase = Math.max(preferAmount(parts.map((part) => part.summary.purchase)) ?? 0, summedPurchase);
  const evaluation = Math.max(preferAmount(parts.map((part) => part.summary.evaluation)) ?? 0, summedEval);
  const deposit = preferAmount(parts.map((part) => part.deposit));
  const reportedPnl = preferAmount(parts.map((part) => part.summary.pnl));
  const reportedAssets = preferAmount(parts.map((part) => part.summary.estimatedAssets));
  const pnl =
    purchase > 0 || evaluation > 0 ? evaluation - purchase : reportedPnl;
  const weightBase = evaluation > 0 ? evaluation : summedEval;
  for (const row of positions) {
    const wonEval = wonBook(row.currency, row.evalAmount, row.krwEvalAmount);
    row.weightPct = wonEval > 0 && weightBase > 0 ? (wonEval / weightBase) * 100 : row.weightPct;
  }
  const fxByCurrency = new Map<string, KiwoomFxCash>();
  for (const part of parts) {
    for (const cash of part.fxCash ?? []) {
      const prev = fxByCurrency.get(cash.currency);
      const rank = (cash.deposit ?? 0) + (cash.evalAmount ?? 0);
      const prevRank = prev ? (prev.deposit ?? 0) + (prev.evalAmount ?? 0) : -1;
      if (!prev || rank > prevRank) fxByCurrency.set(cash.currency, cash);
    }
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
        reportedAssetsIfComplete(reportedAssets, evaluation)
      ),
    },
    positions,
    fxCash: [...fxByCurrency.values()],
  };
}

async function readBook(
  path: string,
  apiId: string,
  body: Record<string, unknown>,
  maxPages = 8
): Promise<Record<string, unknown> | null> {
  try {
    return await kiwoomAuthorizedPostAll(path, apiId, body, maxPages);
  } catch {
    return null;
  }
}

async function readBalance(apiId: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return readBook("/api/dostk/acnt", apiId, body);
}

const BALANCE_CACHE_MS = 15_000;
let balanceCache: { until: number; snapshot: KiwoomAccountSnapshot } | null = null;

async function loadKiwoomBalance(): Promise<KiwoomAccountSnapshot> {
  const now = Date.now();
  if (balanceCache && now < balanceCache.until) return structuredClone(balanceCache.snapshot);
  const [depositEstimated, depositPlain, accountBody, krx18, nxt18, krx04, nxt04, usLedger, usValue] =
    await Promise.all([
      kiwoomAuthorizedPost("/api/dostk/acnt", "kt00001", { qry_tp: "3" }),
      readBalance("kt00001", { qry_tp: "2" }),
      readBalance("ka00001", {}),
      readBalance("kt00018", { qry_tp: "1", dmst_stex_tp: "KRX" }),
      readBalance("kt00018", { qry_tp: "1", dmst_stex_tp: "NXT" }),
      readBalance("kt00004", { qry_tp: "0", dmst_stex_tp: "KRX" }),
      readBalance("kt00004", { qry_tp: "0", dmst_stex_tp: "NXT" }),
      readBook("/api/us/acnt", "ust21070", { stex_tp: "", stk_cd: "" }),
      readBook("/api/us/acnt", "ust21120", { cmsn_incl_tp: "", exrt_tp: "" }),
    ]);
  const rawAccountNo = readAccountNumber(accountBody);
  const snaps = [krx18, nxt18, krx04, nxt04]
    .filter((body): body is Record<string, unknown> => body != null)
    .map((body) => parseKiwoomAccount(depositPlain ?? depositEstimated, body));
  snaps.push(parseKiwoomAccount(depositEstimated, {}));
  if (usLedger) snaps.push(parseUsLedger(usLedger));
  if (usValue) snaps.push(parseUsValuation(usValue));
  const merged = mergeAccountSnapshots(snaps);
  const snapshot: KiwoomAccountSnapshot = {
    ...merged,
    accountNo: formatKiwoomAccountNo(rawAccountNo ?? merged.accountNo),
    historyNote: null,
  };
  balanceCache = { until: Date.now() + BALANCE_CACHE_MS, snapshot };
  return structuredClone(snapshot);
}

export async function fetchKiwoomAccount(options?: { lots?: boolean }): Promise<KiwoomAccountSnapshot> {
  const snapshot = await loadKiwoomBalance();
  if (!options?.lots) return snapshot;
  const held = snapshot.positions.filter((position) => !/^\d{6}$/.test(position.code) && position.qty > 0);
  const { events, failed } = await readUsTradeFills(held);
  const lotsByCode = openLotsFromFills(events);
  for (const position of snapshot.positions) {
    if (/^\d{6}$/.test(position.code)) continue;
    position.lots = groupLotsByPrice(
      reconcileLots(
        lotsByCode.get(lotKey(position.code)) ?? [],
        position.qty,
        position.avgPrice
      )
    );
  }
  snapshot.historyNote =
    held.length > 0 && failed && events.length === 0
      ? "미국 매수 내역을 읽지 못해 분할 잔고 대신 평균만 표시합니다."
      : null;
  return snapshot;
}

const US_HISTORY_SPAN_DAYS = 89;
const US_HISTORY_HORIZON_DAYS = 89 * 8;

async function readUsTradeWindow(
  startAgo: number,
  endAgo: number,
  stockCode: string
): Promise<FillEvent[] | null> {
  const body = await readBook(
    "/api/us/acnt",
    "ust21180",
    {
      strt_dt: kstYmd(startAgo),
      end_dt: kstYmd(endAgo),
      slby_tp: "0",
      stex_tp: "",
      stk_cd: stockCode,
      oppo_trde_tp: "%",
    },
    4
  );
  if (!body) return null;
  return fillsFromOrders(body);
}

function pushFills(into: FillEvent[], seen: Set<string>, next: FillEvent[]): void {
  for (const event of next) {
    if (!event.dealNo) {
      into.push(event);
      continue;
    }
    const key = `${event.code}|${event.dealNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    into.push(event);
  }
}

let usFillCache: { until: number; key: string; events: FillEvent[]; failed: boolean } | null = null;

/** ust21100 allows about three months per call, so walk backward until the open lots are covered. */
async function readUsTradeFills(
  held: { code: string; qty: number }[]
): Promise<{ events: FillEvent[]; failed: boolean }> {
  const key = held
    .map((position) => `${lotKey(position.code)}:${position.qty}`)
    .sort()
    .join("|");
  const now = Date.now();
  if (usFillCache && usFillCache.key === key && now < usFillCache.until) {
    return { events: usFillCache.events, failed: usFillCache.failed };
  }
  const result = await readUsTradeFillsFresh(held);
  const ttl = result.failed && result.events.length === 0 ? 60_000 : 5 * 60_000;
  usFillCache = { until: now + ttl, key, events: result.events, failed: result.failed };
  return result;
}

async function readUsTradeFillsFresh(
  held: { code: string; qty: number }[]
): Promise<{ events: FillEvent[]; failed: boolean }> {
  const events: FillEvent[] = [];
  const seen = new Set<string>();
  let failed = false;
  const windows = historyWindows(US_HISTORY_HORIZON_DAYS, US_HISTORY_SPAN_DAYS);
  const first = windows[0];
  if (first) {
    const page = await readUsTradeWindow(first.startAgo, first.endAgo, "");
    if (!page) failed = true;
    else {
      pushFills(events, seen, page);
      if (lotsCover(events, held)) return { events, failed: false };
    }
  }
  const uncovered = held.filter((position) => !lotsCover(events, [position]));
  for (const position of uncovered) {
    let symbolMisses = 0;
    for (const window of windows) {
      const page = await readUsTradeWindow(window.startAgo, window.endAgo, position.code);
      if (!page) {
        failed = true;
        symbolMisses += 1;
        if (symbolMisses >= 2) break;
        continue;
      }
      symbolMisses = 0;
      pushFills(events, seen, page);
      if (lotsCover(events, [position])) break;
    }
  }
  return { events, failed };
}

function kstYmd(daysAgo: number): string {
  const when = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(when)
    .replace(/-/g, "");
}

const HISTORY_COLUMNS = [
  "deal_dt",
  "deal_kind_nm",
  "rmrk_nm",
  "deal_amt",
  "tax_tot_amt",
  "exct_amt",
  "uncl_ocr",
  "fc_uncl_ocr",
  "entra_remn",
  "deal_no",
  "stk_nm",
  "deal_qty",
  "fc_deal_tax",
  "frgn_pay_txam",
  "rpym_sum",
  "fc_rpym_sum",
  "fc_entra",
  "mdia_nm",
  "orig_deal_no",
  "stk_cd",
  "uv_exrt",
  "fc_cmsn",
  "fc_exct_amt",
  "dly_sum",
  "fc_dly_sum",
  "vlbl_nowrm",
  "stex_nm",
  "fc_deal_amt",
  "proc_time",
  "crnc_code",
];

function historyRow(item: unknown): Record<string, unknown> | null {
  const row = asRecord(item);
  if (row) return row;
  if (!Array.isArray(item)) return null;
  const out: Record<string, unknown> = {};
  HISTORY_COLUMNS.forEach((key, index) => {
    if (item[index] != null) out[key] = item[index];
  });
  return out;
}

/** Share price from the foreign amount, or the unit field when that amount is empty. */
export function historyFillPrice(row: Record<string, unknown>, qty: number): number {
  const amount = firstAbs(row, ["fc_deal_amt"]);
  const unit = firstAbs(row, ["uv_exrt"]);
  const fromAmount = amount != null && amount > 0 && qty > 0 ? amount / qty : 0;
  if (fromAmount > 0 && unit != null && unit > 0 && Math.abs(unit - fromAmount) / fromAmount <= 0.2) {
    return unit;
  }
  if (fromAmount > 0) return fromAmount;
  if (unit != null && unit > 0) return unit;
  return 0;
}

function orderSide(row: Record<string, unknown>): "buy" | "sell" | null {
  const named = classifyDeal(String(row.slby_tp_nm ?? ""));
  if (named) return named;
  const code = String(row.slby_tp ?? "").trim();
  if (code === "2") return "buy";
  if (code === "1") return "sell";
  return null;
}

/** ust21180 rows. Each filled order keeps its own fill price and quantity. */
export function fillsFromOrders(body: Record<string, unknown> | null): FillEvent[] {
  const list = Array.isArray(body?.result_list) ? body.result_list : [];
  const out: FillEvent[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const side = orderSide(row);
    const code = lotKey(usTicker(row.stk_cd));
    const qty = firstAbs(row, ["cntr_qty"]) ?? 0;
    const unit = firstAbs(row, ["cntr_uv"]);
    const amount = firstAbs(row, ["cntr_amt"]);
    const ordered = firstAbs(row, ["ord_uv"]);
    const price =
      unit != null && unit > 0
        ? unit
        : amount != null && amount > 0 && qty > 0
          ? amount / qty
          : ordered != null && ordered > 0
            ? ordered
            : 0;
    if (!side || !code || qty <= 0 || price <= 0) continue;
    const date = String(row.ord_dt ?? "").replace(/\D/g, "");
    const orderNo = String(row.ord_no ?? "").trim();
    out.push({
      date,
      time: String(row.ord_time ?? "").replace(/\D/g, ""),
      code,
      side,
      qty,
      price: Math.round(price * 10000) / 10000,
      dealNo: orderNo ? `${date}|${orderNo}` : undefined,
    });
  }
  return out;
}

export function fillsFromHistory(body: Record<string, unknown> | null): FillEvent[] {
  const list = Array.isArray(body?.result_list) ? body.result_list : [];
  const out: FillEvent[] = [];
  for (const item of list) {
    const row = historyRow(item);
    if (!row) continue;
    const side = classifyDeal(String(row.deal_kind_nm ?? row.rmrk_nm ?? ""));
    const code = lotKey(usTicker(row.stk_cd));
    const qty = firstAbs(row, ["deal_qty"]) ?? 0;
    const price = historyFillPrice(row, qty);
    if (!side || !code || qty <= 0 || price <= 0) continue;
    const dealNo = String(row.deal_no ?? "").trim();
    out.push({
      date: String(row.deal_dt ?? "").replace(/\D/g, ""),
      time: String(row.proc_time ?? "").replace(/\D/g, ""),
      code,
      side,
      qty,
      price: Math.round(price * 10000) / 10000,
      dealNo: dealNo || undefined,
    });
  }
  return out;
}

/** Market sell on the US book. trde_tp 03 is the exchange market order. */
export async function placeKiwoomUsSell(input: {
  code: string;
  qty: number;
  stex: "ND" | "NY" | "NA";
}): Promise<{ orderNo: string }> {
  const qty = Math.trunc(input.qty);
  const code = input.code.trim().toUpperCase();
  if (!code || qty <= 0) throw new KiwoomQuoteError("종목코드와 수량을 확인하세요");
  const json = await kiwoomAuthorizedPost("/api/us/ordr", "ust20001", {
    stk_cd: code,
    stex_tp: input.stex,
    ord_qty: String(qty),
    trde_tp: "03",
    ord_uv: "",
  });
  const orderNo = String(json.ord_no ?? json.ordNo ?? "").trim();
  if (!orderNo) throw new KiwoomQuoteError("주문번호가 없습니다");
  return { orderNo };
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
