import type { Candle } from "@/lib/types";
import { candlesToSyntheticTicks } from "@/lib/chart-transforms";

/** Feature ID: options.* — mock delayed options chain */
export interface OptionRow {
  strike: number;
  callBid: number;
  callAsk: number;
  callVol: number;
  putBid: number;
  putAsk: number;
  putVol: number;
  iv: number;
}

export function mockOptionsChain(
  spot: number,
  ticker: string,
  rows = 11
): { expiry: string; rows: OptionRow[] } {
  const mid = Math.round(spot / 5) * 5;
  const half = Math.floor(rows / 2);
  const list: OptionRow[] = [];
  for (let i = -half; i <= half; i++) {
    const strike = mid + i * 5;
    const moneyness = (spot - strike) / spot;
    const iv = 0.22 + Math.abs(moneyness) * 0.4 + (ticker.length % 7) * 0.01;
    const callMid = Math.max(0.05, spot - strike + iv * spot * 0.08);
    const putMid = Math.max(0.05, strike - spot + iv * spot * 0.08);
    list.push({
      strike,
      callBid: round(callMid * 0.98),
      callAsk: round(callMid * 1.02),
      callVol: Math.floor(800 + Math.abs(i) * 120),
      putBid: round(putMid * 0.98),
      putAsk: round(putMid * 1.02),
      putVol: Math.floor(600 + Math.abs(i) * 90),
      iv: round(iv),
    });
  }
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  const expiry = d.toISOString().slice(0, 10);
  return { expiry, rows: list };
}

/** Feature ID: yield_curves */
export interface YieldPoint {
  tenor: string;
  months: number;
  yieldPct: number;
}

export function mockYieldCurve(region: "US" | "KR" = "US"): YieldPoint[] {
  const base = region === "US" ? 4.25 : 3.1;
  const tenors: { tenor: string; months: number }[] = [
    { tenor: "3M", months: 3 },
    { tenor: "6M", months: 6 },
    { tenor: "1Y", months: 12 },
    { tenor: "2Y", months: 24 },
    { tenor: "5Y", months: 60 },
    { tenor: "10Y", months: 120 },
    { tenor: "30Y", months: 360 },
  ];
  return tenors.map((t, i) => ({
    ...t,
    yieldPct: round(base - 0.15 + i * 0.08 + (region === "KR" ? -0.4 : 0)),
  }));
}

/** Feature ID: macro.maps */
export interface MacroRegion {
  id: string;
  name: string;
  nameKo: string;
  gdpGrowth: number;
  inflation: number;
  policyRate: number;
  sentiment: "risk_on" | "neutral" | "risk_off";
}

export function mockMacroRegions(): MacroRegion[] {
  return [
    {
      id: "us",
      name: "United States",
      nameKo: "미국",
      gdpGrowth: 2.1,
      inflation: 2.8,
      policyRate: 5.25,
      sentiment: "neutral",
    },
    {
      id: "eu",
      name: "Eurozone",
      nameKo: "유로존",
      gdpGrowth: 0.9,
      inflation: 2.4,
      policyRate: 4.0,
      sentiment: "risk_off",
    },
    {
      id: "cn",
      name: "China",
      nameKo: "중국",
      gdpGrowth: 4.8,
      inflation: 0.6,
      policyRate: 3.45,
      sentiment: "neutral",
    },
    {
      id: "jp",
      name: "Japan",
      nameKo: "일본",
      gdpGrowth: 1.2,
      inflation: 2.6,
      policyRate: 0.1,
      sentiment: "risk_on",
    },
    {
      id: "kr",
      name: "Korea",
      nameKo: "한국",
      gdpGrowth: 2.3,
      inflation: 2.7,
      policyRate: 3.5,
      sentiment: "risk_on",
    },
  ];
}

/** Feature ID: trade.broker — connect stub (no real OMS) */
export type BrokerConnectState =
  | "disconnected"
  | "connecting"
  | "connected_mock";

export interface BrokerStubStatus {
  state: BrokerConnectState;
  brokerName: string;
  accountId: string;
  buyingPower: number;
  message: string;
}

export function mockBrokerDisconnected(): BrokerStubStatus {
  return {
    state: "disconnected",
    brokerName: "—",
    accountId: "—",
    buyingPower: 0,
    message: "브로커 API 키 없음 · 모의 연결만 지원",
  };
}

export function mockBrokerConnected(accountSeed: string): BrokerStubStatus {
  const n = accountSeed.length * 1000 + 25000;
  return {
    state: "connected_mock",
    brokerName: "ChartDesk Paper Bridge (mock)",
    accountId: `MOCK-${accountSeed.slice(-6).toUpperCase()}`,
    buyingPower: n,
    message: "실제 주문 라우팅 없음 · UI 스텁",
  };
}

/** Feature ID: dom — depth of market ladder */
export interface DomLevel {
  price: number;
  bidSize: number;
  askSize: number;
}

export function mockDomLadder(mid: number, levels = 20): DomLevel[] {
  const tick = mid > 1000 ? 100 : mid > 50 ? 0.05 : 0.01;
  const out: DomLevel[] = [];
  for (let i = levels; i >= 1; i--) {
    const askPx = round(mid + i * tick);
    out.push({
      price: askPx,
      bidSize: 0,
      askSize: Math.floor(400 + i * 85 + (askPx % 7) * 20),
    });
  }
  out.push({
    price: round(mid),
    bidSize: Math.floor(1200 + (mid % 11) * 50),
    askSize: Math.floor(1100 + (mid % 13) * 40),
  });
  for (let i = 1; i <= levels; i++) {
    const bidPx = round(mid - i * tick);
    out.push({
      price: bidPx,
      bidSize: Math.floor(380 + i * 80 + (bidPx % 5) * 15),
      askSize: 0,
    });
  }
  return out;
}

export { candlesToSyntheticTicks };

export function expandToTickCandles(
  minuteCandles: Candle[],
  limit = 240
): Candle[] {
  const ticks = candlesToSyntheticTicks(minuteCandles, 10);
  return ticks.slice(-limit);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
