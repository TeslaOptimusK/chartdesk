"use client";

import { create } from "zustand";
import type {
  AlertItem,
  ChartStyle,
  Drawing,
  DrawingTool,
  Opinion,
  PatternDef,
  PatternHit,
  Post,
  PriceWatch,
  SymbolMeta,
  Timeframe,
  WorkspaceLayoutPreset,
} from "@/lib/types";

export type RightTab =
  | "watchlist"
  | "opinions"
  | "patterns"
  | "posts"
  | "alerts"
  | "objects";
export type LayoutMode = "single" | "split2" | "split4";
export type IndicatorId =
  | "sma20"
  | "ema9"
  | "bb"
  | "rsi"
  | "macd"
  | "atr"
  | "vwap"
  | "volMa";

const LAYOUT_KEY = "chartdesk-layouts-v1";

interface WorkspaceState {
  ready: boolean;
  symbols: SymbolMeta[];
  posts: Post[];
  opinions: Opinion[];
  patterns: PatternDef[];
  patternHits: PatternHit[];
  alerts: AlertItem[];
  drawings: Drawing[];
  watchlist: string[];
  activeSymbolId: string;
  secondarySymbolIds: string[];
  compareSymbolId: string | null;
  timeframe: Timeframe;
  drawingTool: DrawingTool;
  indicators: IndicatorId[];
  chartStyle: ChartStyle;
  rightTab: RightTab;
  layoutMode: LayoutMode;
  showDisclaimer: boolean;
  magnet: boolean;
  fullscreen: boolean;
  timezone: string;
  goToDate: string | null;
  priceWatches: PriceWatch[];
  layouts: WorkspaceLayoutPreset[];
  setReady: (v: boolean) => void;
  hydrate: (data: {
    symbols: SymbolMeta[];
    posts: Post[];
    opinions: Opinion[];
    patterns: PatternDef[];
    patternHits: PatternHit[];
    alerts: AlertItem[];
    drawings: Drawing[];
    watchlist: string[];
  }) => void;
  setActiveSymbol: (id: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setDrawingTool: (tool: DrawingTool) => void;
  toggleIndicator: (id: IndicatorId) => void;
  setChartStyle: (style: ChartStyle) => void;
  setRightTab: (tab: RightTab) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setSecondarySymbols: (ids: string[]) => void;
  setCompareSymbolId: (id: string | null) => void;
  setShowDisclaimer: (v: boolean) => void;
  setMagnet: (v: boolean) => void;
  setFullscreen: (v: boolean) => void;
  setTimezone: (tz: string) => void;
  setGoToDate: (isoDate: string | null) => void;
  upsertPost: (post: Post) => void;
  upsertOpinions: (opinions: Opinion[]) => void;
  setOpinions: (opinions: Opinion[]) => void;
  setPatternHits: (hits: PatternHit[]) => void;
  setPatterns: (patterns: PatternDef[]) => void;
  setAlerts: (alerts: AlertItem[]) => void;
  setDrawings: (drawings: Drawing[]) => void;
  setWatchlist: (ids: string[]) => void;
  addPriceWatch: (watch: Omit<PriceWatch, "id" | "createdAt">) => void;
  setPriceWatches: (watches: PriceWatch[]) => void;
  saveLayout: (name: string) => void;
  loadLayout: (id: string) => void;
  deleteLayout: (id: string) => void;
}

function readLayouts(): WorkspaceLayoutPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceLayoutPreset[]) : [];
  } catch {
    return [];
  }
}

function writeLayouts(layouts: WorkspaceLayoutPreset[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layouts));
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  ready: false,
  symbols: [],
  posts: [],
  opinions: [],
  patterns: [],
  patternHits: [],
  alerts: [],
  drawings: [],
  watchlist: [],
  activeSymbolId: "kr_005930",
  secondarySymbolIds: ["us_NVDA", "crypto_BTCUSDT", "kr_000660"],
  compareSymbolId: null,
  timeframe: "D",
  drawingTool: "none",
  indicators: ["sma20", "ema9"],
  chartStyle: "candle",
  rightTab: "watchlist",
  layoutMode: "single",
  showDisclaimer: true,
  magnet: true,
  fullscreen: false,
  timezone: "Asia/Seoul",
  goToDate: null,
  priceWatches: [],
  layouts: [],
  setReady: (v) => set({ ready: v }),
  hydrate: (data) =>
    set({
      ...data,
      activeSymbolId: data.watchlist[0] ?? data.symbols[0]?.id ?? "kr_005930",
      ready: true,
      layouts: readLayouts(),
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
    }),
  setActiveSymbol: (id) => set({ activeSymbolId: id }),
  setTimeframe: (tf) => set({ timeframe: tf }),
  setDrawingTool: (tool) => set({ drawingTool: tool }),
  toggleIndicator: (id) => {
    const cur = get().indicators;
    set({
      indicators: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    });
  },
  setChartStyle: (style) => set({ chartStyle: style }),
  setRightTab: (tab) => set({ rightTab: tab }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSecondarySymbols: (ids) => set({ secondarySymbolIds: ids }),
  setCompareSymbolId: (id) => set({ compareSymbolId: id }),
  setShowDisclaimer: (v) => set({ showDisclaimer: v }),
  setMagnet: (v) => set({ magnet: v }),
  setFullscreen: (v) => set({ fullscreen: v }),
  setTimezone: (tz) => set({ timezone: tz }),
  setGoToDate: (isoDate) => set({ goToDate: isoDate }),
  upsertPost: (post) => set({ posts: [post, ...get().posts] }),
  upsertOpinions: (opinions) =>
    set({ opinions: [...opinions, ...get().opinions] }),
  setOpinions: (opinions) => set({ opinions }),
  setPatternHits: (hits) => {
    const others = get().patternHits.filter(
      (h) => !hits.some((n) => n.id === h.id)
    );
    set({ patternHits: [...hits, ...others] });
  },
  setPatterns: (patterns) => set({ patterns }),
  setAlerts: (alerts) => set({ alerts }),
  setDrawings: (drawings) => set({ drawings }),
  setWatchlist: (ids) => set({ watchlist: ids }),
  addPriceWatch: (watch) => {
    const created: PriceWatch = {
      ...watch,
      id: `pw_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    set({ priceWatches: [created, ...get().priceWatches] });
  },
  setPriceWatches: (watches) => set({ priceWatches: watches }),
  saveLayout: (name) => {
    const s = get();
    const preset: WorkspaceLayoutPreset = {
      id: `lay_${Date.now()}`,
      name,
      symbolId: s.activeSymbolId,
      compareSymbolId: s.compareSymbolId,
      timeframe: s.timeframe,
      chartStyle: s.chartStyle,
      indicators: s.indicators,
      layoutMode: s.layoutMode,
      magnet: s.magnet,
      savedAt: new Date().toISOString(),
    };
    const layouts = [preset, ...s.layouts].slice(0, 20);
    writeLayouts(layouts);
    set({ layouts });
  },
  loadLayout: (id) => {
    const preset = get().layouts.find((l) => l.id === id);
    if (!preset) return;
    set({
      activeSymbolId: preset.symbolId,
      compareSymbolId: preset.compareSymbolId,
      timeframe: preset.timeframe,
      chartStyle: preset.chartStyle,
      indicators: preset.indicators as IndicatorId[],
      layoutMode: preset.layoutMode,
      magnet: preset.magnet,
    });
  },
  deleteLayout: (id) => {
    const layouts = get().layouts.filter((l) => l.id !== id);
    writeLayouts(layouts);
    set({ layouts });
  },
}));
