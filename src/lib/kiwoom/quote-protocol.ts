import type { Candle, Timeframe } from "@/lib/types";
import { secondsPerBar } from "@/lib/market-data/types";

/** Korea has no DST. Wall-clock KST = UTC+9. */
export const KST_OFFSET_SEC = 9 * 3600;

export interface KiwoomTick {
  code: string;
  epochSec: number;
  price: number;
  /** This print's size (FID 15). */
  tickVolume: number;
  /** Day cumulative volume (FID 13), when the print includes it. */
  accVolume: number | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
}

export function kstYmd(epochSec: number): string {
  const d = new Date((epochSec + KST_OFFSET_SEC) * 1000);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${day}`;
}

/** Parse YYYYMMDDHHmmss as KST wall time into unix seconds. */
export function kstYmdHmsToEpoch(raw: string): number | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const utcGuess = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  );
  if (!Number.isFinite(utcGuess)) return null;
  return utcGuess / 1000 - KST_OFFSET_SEC;
}

export function kstDateToEpoch(ymd: string): number | null {
  if (!/^\d{8}$/.test(ymd)) return null;
  return kstYmdHmsToEpoch(`${ymd}000000`);
}

/** HHMMSS combined with today's KST date. A clock far ahead of now is yesterday. */
export function kstClockToEpoch(hms: string, nowSec: number): number | null {
  if (!/^\d{6}$/.test(hms)) return null;
  const epoch = kstYmdHmsToEpoch(`${kstYmd(nowSec)}${hms}`);
  if (epoch == null) return null;
  if (epoch - nowSec > 6 * 3600) return epoch - 86400;
  return epoch;
}

export function kstDayStart(epochSec: number): number {
  const shifted = epochSec + KST_OFFSET_SEC;
  return shifted - (shifted % 86400) - KST_OFFSET_SEC;
}

export function kstWeekStart(epochSec: number): number {
  const dayStart = kstDayStart(epochSec);
  const shifted = dayStart + KST_OFFSET_SEC;
  const dow = new Date(shifted * 1000).getUTCDay();
  const deltaDays = dow === 0 ? 6 : dow - 1;
  return dayStart - deltaDays * 86400;
}

export function kstMonthStart(epochSec: number): number {
  const d = new Date((epochSec + KST_OFFSET_SEC) * 1000);
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return utc / 1000 - KST_OFFSET_SEC;
}

export function alignBarTime(epochSec: number, tf: Timeframe): number {
  if (tf === "W") return kstWeekStart(epochSec);
  if (tf === "M") return kstMonthStart(epochSec);
  if (tf === "D") return kstDayStart(epochSec);
  const step = secondsPerBar(tf);
  if (step <= 0) return epochSec;
  return epochSec - (epochSec % step);
}

/** Domestic cash equity. Kiwoom realtime covers these 6-digit codes. */
export function toKiwoomCode(
  ticker: string,
  exchange?: string,
  assetClass?: string
): string | null {
  const t = ticker.trim();
  if (!/^\d{6}$/.test(t)) return null;
  if (assetClass && assetClass !== "kr_stock") return null;
  if (
    exchange &&
    exchange !== "KRX" &&
    exchange !== "KOSPI" &&
    exchange !== "KOSDAQ" &&
    exchange !== "KONEX"
  ) {
    return null;
  }
  return t;
}

export function normalizeItemCode(item: string): string {
  const m = item.trim().match(/(\d{6})/);
  return m ? m[1]! : item.trim();
}

/** Prices arrive as "+74800" / "-100". The sign is up/down, not a negative price. */
export function parseKiwoomAbs(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return Math.abs(raw);
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/,/g, "").replace(/^\+/, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

export function kiwoomOk(code: unknown): boolean {
  return code == null || code === 0 || code === "0";
}

export function buildLoginMessage(token: string): string {
  return JSON.stringify({ trnm: "LOGIN", token });
}

export function buildRegMessage(codes: string[], refresh: "0" | "1"): string {
  return JSON.stringify({
    trnm: "REG",
    grp_no: "1",
    refresh,
    data: [{ item: codes, type: ["0B"] }],
  });
}

export function buildRemoveMessage(codes: string[]): string {
  return JSON.stringify({
    trnm: "REMOVE",
    grp_no: "1",
    data: [{ item: codes, type: ["0B"] }],
  });
}

export type KiwoomUsExchange = "ND" | "NY" | "NA";

/** US cash equity for the FE realtime feed. ND=NASDAQ, NY=NYSE, NA=AMEX. */
export function toKiwoomUs(
  ticker: string,
  exchange?: string,
  assetClass?: string
): { jmcode: string; stex: KiwoomUsExchange } | null {
  if (assetClass === "kr_stock" || assetClass === "crypto") return null;
  const jmcode = ticker.trim().toUpperCase();
  if (!/^[A-Z][A-Z.\-]{0,9}$/.test(jmcode) || /^\d{6}$/.test(jmcode)) return null;
  const ex = (exchange ?? "").toUpperCase();
  const us =
    assetClass === "us_stock" ||
    ex.includes("NAS") ||
    ex.includes("NYS") ||
    ex.includes("AMEX") ||
    ex === "ND" ||
    ex === "NY" ||
    ex === "NA";
  if (!us) return null;
  const stex: KiwoomUsExchange =
    ex.includes("NYS") || ex === "NY" || ex === "NYSE"
      ? "NY"
      : ex.includes("AMEX") || ex === "NA"
        ? "NA"
        : "ND";
  return { jmcode, stex };
}

export function buildUsRegMessage(
  codes: string[],
  refresh: "0" | "1",
  stexByCode: ReadonlyMap<string, KiwoomUsExchange>
): string {
  return JSON.stringify({
    trnm: "REG",
    grp_no: "1",
    refresh,
    data: [
      {
        item: codes.map((code) => ({
          jmcode: code,
          stex_tp: stexByCode.get(code) ?? "ND",
        })),
        type: ["FE"],
      },
    ],
  });
}

export function buildUsRemoveMessage(
  codes: string[],
  stexByCode: ReadonlyMap<string, KiwoomUsExchange>
): string {
  return JSON.stringify({
    trnm: "REMOVE",
    grp_no: "1",
    data: [
      {
        item: codes.map((code) => ({
          jmcode: code,
          stex_tp: stexByCode.get(code) ?? "ND",
        })),
        type: ["FE"],
      },
    ],
  });
}

function usItemCode(item: unknown): string {
  if (typeof item === "string") return item.trim().toUpperCase();
  const row = asRecord(item);
  if (!row) return "";
  return String(row.jmcode ?? row.item ?? "")
    .trim()
    .toUpperCase();
}

/** FE 미국주식 실시간 체결가. Field 10 is the last trade, same as domestic 0B. */
export function parseUsRealTicks(message: unknown, nowSec: number): KiwoomTick[] {
  const root = asRecord(message);
  if (!root || root.trnm !== "REAL") return [];
  const data = Array.isArray(root.data) ? root.data : [];
  const out: KiwoomTick[] = [];
  for (const entry of data) {
    const row = asRecord(entry);
    if (!row || String(row.type) !== "FE") continue;
    const values = asRecord(row.values) ?? row;
    const price = parseKiwoomAbs(values["10"] ?? values.cur_prc);
    if (price == null || price <= 0) continue;
    const code = usItemCode(row.item) || usItemCode(values.jmcode);
    if (!/^[A-Z][A-Z.\-]{0,9}$/.test(code)) continue;
    const epochSec = parseKiwoomTime(values["20"] ?? values["51020"], nowSec) ?? nowSec;
    out.push({
      code,
      epochSec,
      price,
      tickVolume: parseKiwoomAbs(values["15"]) ?? 0,
      accVolume: parseKiwoomAbs(values["13"]),
      dayOpen: parseKiwoomAbs(values["16"]),
      dayHigh: parseKiwoomAbs(values["17"]),
      dayLow: parseKiwoomAbs(values["18"]),
    });
  }
  return out;
}

export function isPingMessage(parsed: unknown): boolean {
  const row = asRecord(parsed);
  return row?.trnm === "PING";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

export function parseKiwoomTime(raw: unknown, nowSec: number): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return parseKiwoomTime(String(Math.trunc(raw)), nowSec);
  }
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 14) return kstYmdHmsToEpoch(digits.slice(0, 14));
  if (digits.length === 8) return kstDateToEpoch(digits);
  if (digits.length === 6) return kstClockToEpoch(digits, nowSec);
  return null;
}

export function parseRealTicks(message: unknown, nowSec: number): KiwoomTick[] {
  const root = asRecord(message);
  if (!root || root.trnm !== "REAL") return [];
  const data = Array.isArray(root.data) ? root.data : [];
  const out: KiwoomTick[] = [];
  for (const entry of data) {
    const row = asRecord(entry);
    if (!row || String(row.type) !== "0B") continue;
    const values = asRecord(row.values) ?? row;
    const price = parseKiwoomAbs(values["10"] ?? values.cur_prc);
    if (price == null || price <= 0) continue;
    const code = normalizeItemCode(String(row.item ?? values.item ?? ""));
    if (!/^\d{6}$/.test(code)) continue;
    const epochSec = parseKiwoomTime(values["20"] ?? values.cntr_tm, nowSec);
    if (epochSec == null) continue;
    out.push({
      code,
      epochSec,
      price,
      tickVolume: parseKiwoomAbs(values["15"]) ?? 0,
      accVolume: parseKiwoomAbs(values["13"]),
      dayOpen: parseKiwoomAbs(values["16"]),
      dayHigh: parseKiwoomAbs(values["17"]),
      dayLow: parseKiwoomAbs(values["18"]),
    });
  }
  return out;
}

export function chartQuerySpec(
  tf: Timeframe,
  code: string,
  nowSec: number
): { apiId: string; body: Record<string, string> } {
  const base = { stk_cd: code, upd_stkpc_tp: "1" };
  switch (tf) {
    case "tick":
    case "1":
      return { apiId: "ka10080", body: { ...base, tic_scope: "1" } };
    case "3":
    case "5":
    case "10":
    case "15":
    case "30":
    case "60":
      return { apiId: "ka10080", body: { ...base, tic_scope: tf } };
    case "120":
    case "240":
      return { apiId: "ka10080", body: { ...base, tic_scope: "60" } };
    case "D":
      return { apiId: "ka10081", body: { ...base, base_dt: kstYmd(nowSec) } };
    case "W":
      return { apiId: "ka10082", body: { ...base, base_dt: kstYmd(nowSec) } };
    case "M":
      return { apiId: "ka10083", body: { ...base, base_dt: kstYmd(nowSec) } };
  }
}

const CHART_LIST_KEYS = [
  "stk_min_pole_chart_qry",
  "stk_dt_pole_chart_qry",
  "stk_wk_pole_chart_qry",
  "stk_mth_pole_chart_qry",
  "stk_stk_pole_chart_qry",
  "stk_yr_pole_chart_qry",
];

function isChartRow(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return (
    "cur_prc" in v ||
    "open_pric" in v ||
    "stck_prpr" in v ||
    "cntr_tm" in v ||
    "dt" in v
  );
}

export function chartRowsFromBody(body: unknown): Record<string, unknown>[] {
  const root = asRecord(body);
  if (!root) return [];
  for (const key of CHART_LIST_KEYS) {
    const list = root[key];
    if (Array.isArray(list)) return list.filter(isChartRow);
  }
  for (const value of Object.values(root)) {
    if (Array.isArray(value) && value.some(isChartRow)) {
      return value.filter(isChartRow);
    }
  }
  return [];
}

function rowToCandle(row: Record<string, unknown>, nowSec: number): Candle | null {
  const close = parseKiwoomAbs(row.cur_prc ?? row.close_pric ?? row.stck_prpr);
  if (close == null || close <= 0) return null;
  const open = parseKiwoomAbs(row.open_pric ?? row.stck_oprc) ?? close;
  const high = parseKiwoomAbs(row.high_pric ?? row.stck_hgpr) ?? Math.max(open, close);
  const low = parseKiwoomAbs(row.low_pric ?? row.stck_lwpr) ?? Math.min(open, close);
  const volume = parseKiwoomAbs(row.trde_qty ?? row.trde_vol) ?? 0;
  const epoch = parseKiwoomTime(row.cntr_tm ?? row.dt, nowSec);
  if (epoch == null) return null;
  return { time: epoch, open, high, low, close, volume };
}

export function candlesFromChartBody(
  body: unknown,
  tf: Timeframe,
  limit: number,
  nowSec: number
): Candle[] {
  const parsed: Candle[] = [];
  for (const row of chartRowsFromBody(body)) {
    const candle = rowToCandle(row, nowSec);
    if (candle) parsed.push(candle);
  }
  parsed.sort((a, b) => a.time - b.time);
  const merged = bucketMerge(parsed, tf);
  if (limit > 0 && merged.length > limit) return merged.slice(-limit);
  return merged;
}

function bucketMerge(bars: Candle[], tf: Timeframe): Candle[] {
  const out: Candle[] = [];
  for (const bar of bars) {
    const time = alignBarTime(bar.time, tf);
    const prev = out[out.length - 1];
    if (!prev || prev.time !== time) {
      out.push({ ...bar, time });
      continue;
    }
    prev.high = Math.max(prev.high, bar.high);
    prev.low = Math.min(prev.low, bar.low);
    prev.close = bar.close;
    prev.volume += bar.volume;
  }
  return out;
}

export function foldTickIntoBar(
  prev: Candle | null,
  tick: KiwoomTick,
  tf: Timeframe
): Candle {
  const time = alignBarTime(tick.epochSec, tf);
  const px = tick.price;
  const tickVol = Number.isFinite(tick.tickVolume) ? tick.tickVolume : 0;
  if (!prev || prev.time !== time) {
    if (tf === "D") {
      return {
        time,
        open: tick.dayOpen ?? px,
        high: Math.max(px, tick.dayHigh ?? px),
        low: Math.min(px, tick.dayLow ?? px),
        close: px,
        volume: tick.accVolume ?? tickVol,
      };
    }
    return { time, open: px, high: px, low: px, close: px, volume: tickVol };
  }
  if (tf === "D" && tick.accVolume != null) {
    return {
      time,
      open: prev.open,
      high: Math.max(prev.high, px, tick.dayHigh ?? px),
      low: Math.min(prev.low, px, tick.dayLow ?? px),
      close: px,
      volume: Math.max(prev.volume, tick.accVolume),
    };
  }
  return {
    time,
    open: prev.open,
    high: Math.max(prev.high, px),
    low: Math.min(prev.low, px),
    close: px,
    volume: prev.volume + tickVol,
  };
}

/** Keep the historical open when a tick arrived before the REST seed. */
export function mergeSeedBar(seed: Candle | null, live: Candle | null): Candle | null {
  if (!live) return seed;
  if (!seed) return live;
  if (seed.time !== live.time) return live.time >= seed.time ? live : seed;
  return {
    time: live.time,
    open: seed.open,
    high: Math.max(seed.high, live.high),
    low: Math.min(seed.low, live.low),
    close: live.close,
    volume: Math.max(seed.volume, live.volume),
  };
}
