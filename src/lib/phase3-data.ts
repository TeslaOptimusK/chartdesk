import type { SymbolMeta } from "@/lib/types";

/** Mock screener universe — Feature ID: screener.stock */
export interface ScreenerRow {
  symbolId: string;
  ticker: string;
  marketCapBn: number;
  changePct: number;
  volumeMn: number;
  sector: string;
}

const SECTORS = ["Tech", "Finance", "Health", "Energy", "Consumer", "Industrial"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function mockScreenerRows(symbols: SymbolMeta[]): ScreenerRow[] {
  return symbols.map((s) => {
    const h = hash(s.id);
    return {
      symbolId: s.id,
      ticker: s.ticker,
      marketCapBn: 5 + (h % 900),
      changePct: ((h % 200) - 100) / 10,
      volumeMn: 1 + (h % 80),
      sector: SECTORS[h % SECTORS.length],
    };
  });
}

export function filterScreener(
  rows: ScreenerRow[],
  filters: {
    minCap?: number;
    maxCap?: number;
    minChange?: number;
    maxChange?: number;
    minVol?: number;
    sector?: string;
  }
): ScreenerRow[] {
  return rows.filter((r) => {
    if (filters.minCap != null && r.marketCapBn < filters.minCap) return false;
    if (filters.maxCap != null && r.marketCapBn > filters.maxCap) return false;
    if (filters.minChange != null && r.changePct < filters.minChange) return false;
    if (filters.maxChange != null && r.changePct > filters.maxChange) return false;
    if (filters.minVol != null && r.volumeMn < filters.minVol) return false;
    if (filters.sector && r.sector !== filters.sector) return false;
    return true;
  });
}

/** Feature ID: heatmap */
export interface HeatmapCell {
  id: string;
  label: string;
  changePct: number;
  size: number;
}

export function mockSectorHeatmap(symbols: SymbolMeta[]): HeatmapCell[] {
  const bySector = new Map<string, SymbolMeta[]>();
  for (const s of symbols) {
    const sec = SECTORS[hash(s.id) % SECTORS.length];
    const list = bySector.get(sec) ?? [];
    list.push(s);
    bySector.set(sec, list);
  }
  const cells: HeatmapCell[] = [];
  for (const [label, list] of bySector) {
    const avg =
      list.reduce((a, s) => a + ((hash(s.id) % 200) - 100) / 10, 0) / list.length;
    cells.push({
      id: `sec_${label}`,
      label,
      changePct: avg,
      size: list.length,
    });
  }
  return cells;
}

export function mockWatchlistHeatmap(
  symbols: SymbolMeta[],
  watchlist: string[]
): HeatmapCell[] {
  return watchlist.map((id) => {
    const s = symbols.find((x) => x.id === id);
    const h = hash(id);
    return {
      id,
      label: s?.ticker ?? id,
      changePct: ((h % 200) - 100) / 10,
      size: 1 + (h % 5),
    };
  });
}

/** Feature ID: fund.graphs */
export interface FundamentalPoint {
  period: string;
  eps: number;
  revenueBn: number;
}

export function mockFundamentals(symbolId: string): FundamentalPoint[] {
  const h = hash(symbolId);
  const out: FundamentalPoint[] = [];
  for (let q = 0; q < 8; q++) {
    out.push({
      period: `20${24 - Math.floor(q / 4)} Q${((q % 4) + 1)}`,
      eps: 1.2 + (h % 50) / 10 + q * 0.08,
      revenueBn: 10 + (h % 100) + q * 2.5,
    });
  }
  return out.reverse();
}

/** Feature ID: portfolio */
export interface PortfolioHolding {
  symbolId: string;
  shares: number;
  avgCost: number;
  last: number;
}

export function mockPortfolio(symbols: SymbolMeta[]): PortfolioHolding[] {
  return symbols.slice(0, 6).map((s, i) => {
    const h = hash(s.id);
    const last = 50 + (h % 400);
    return {
      symbolId: s.id,
      shares: 10 + (i + 1) * 5,
      avgCost: last * (0.92 + (h % 10) / 100),
      last,
    };
  });
}

/** Feature ID: chart.seasonals — avg return by calendar month (%) */
export function mockSeasonals(symbolId: string): { month: number; avgReturn: number }[] {
  const h = hash(symbolId);
  return Array.from({ length: 12 }, (_, m) => ({
    month: m + 1,
    avgReturn: Math.sin((m + h % 12) / 12 * Math.PI * 2) * 3 + (h % 7) / 10,
  }));
}
