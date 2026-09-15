import type { CalendarEvent, ChartEventMarker } from "@/lib/types";

/** Seed calendars + event markers (Feature IDs: calendar.*, events.*) */
export function buildCalendarEvents(): CalendarEvent[] {
  const now = Date.now();
  const day = 86400000;
  return [
    {
      id: "eco_cpi",
      kind: "eco",
      title: "미국 CPI (YoY)",
      at: new Date(now + 2 * day).toISOString(),
      impact: "high",
    },
    {
      id: "eco_fomc",
      kind: "eco",
      title: "FOMC 금리 결정",
      at: new Date(now + 9 * day).toISOString(),
      impact: "high",
    },
    {
      id: "eco_nfp",
      kind: "eco",
      title: "비농업 고용",
      at: new Date(now + 16 * day).toISOString(),
      impact: "medium",
    },
    {
      id: "earn_nvda",
      kind: "earnings",
      title: "NVDA 실적 발표",
      at: new Date(now + 5 * day).toISOString(),
      symbolId: "us_NVDA",
      impact: "high",
    },
    {
      id: "earn_aapl",
      kind: "earnings",
      title: "AAPL 실적 발표",
      at: new Date(now + 12 * day).toISOString(),
      symbolId: "us_AAPL",
      impact: "medium",
    },
    {
      id: "earn_005930",
      kind: "earnings",
      title: "삼성전자 실적",
      at: new Date(now + 20 * day).toISOString(),
      symbolId: "kr_005930",
      impact: "medium",
    },
  ];
}

export function buildEventMarkers(symbolId: string): ChartEventMarker[] {
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  return [
    {
      id: `earn_${symbolId}`,
      kind: "earnings",
      symbolId,
      time: now - 40 * day,
      title: "실적",
      detail: "분기 실적 발표",
    },
    {
      id: `div_${symbolId}`,
      kind: "dividends",
      symbolId,
      time: now - 25 * day,
      title: "배당",
      detail: "배당락일",
    },
    {
      id: `split_${symbolId}`,
      kind: "splits",
      symbolId,
      time: now - 90 * day,
      title: "분할",
      detail: "주식 분할",
    },
    {
      id: `news_${symbolId}`,
      kind: "news",
      symbolId,
      time: now - 7 * day,
      title: "뉴스",
      detail: "주요 헤드라인",
    },
  ];
}

/** Feature ID: pattern.candlestick — simple candle pattern labels */
export function detectCandlestickPatterns(
  candles: { time: number; open: number; high: number; low: number; close: number }[]
): { time: number; label: string }[] {
  const out: { time: number; label: string }[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low || 1;
    const lower = Math.min(c.open, c.close) - c.low;
    const upper = c.high - Math.max(c.open, c.close);

    if (lower > body * 2 && upper < body * 0.5 && body / range < 0.35) {
      out.push({ time: c.time, label: "해머" });
    }
    if (
      p.close < p.open &&
      c.close > c.open &&
      c.open <= p.close &&
      c.close >= p.open
    ) {
      out.push({ time: c.time, label: "상승장악" });
    }
    if (
      p.close > p.open &&
      c.close < c.open &&
      c.open >= p.close &&
      c.close <= p.open
    ) {
      out.push({ time: c.time, label: "하락장악" });
    }
  }
  return out.slice(-12);
}

/** Feature ID: pattern.auto_chart — crude swing structure labels */
export function detectAutoChartPatterns(
  candles: { time: number; high: number; low: number; close: number }[]
): { from: number; to: number; label: string }[] {
  if (candles.length < 30) return [];
  const out: { from: number; to: number; label: string }[] = [];
  const mid = Math.floor(candles.length * 0.55);
  const left = candles.slice(0, mid);
  const right = candles.slice(mid);
  const leftLow = left.reduce((a, c) => (c.low < a.low ? c : a), left[0]);
  const rightLow = right.reduce((a, c) => (c.low < a.low ? c : a), right[0]);
  if (Math.abs(leftLow.low - rightLow.low) / leftLow.low < 0.03) {
    out.push({
      from: leftLow.time,
      to: rightLow.time,
      label: "이중바닥?",
    });
  }
  const leftHigh = left.reduce((a, c) => (c.high > a.high ? c : a), left[0]);
  const rightHigh = right.reduce((a, c) => (c.high > a.high ? c : a), right[0]);
  if (Math.abs(leftHigh.high - rightHigh.high) / leftHigh.high < 0.03) {
    out.push({
      from: leftHigh.time,
      to: rightHigh.time,
      label: "이중천장?",
    });
  }
  return out;
}
