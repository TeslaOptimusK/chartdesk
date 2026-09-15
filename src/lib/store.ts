"use client";

import { create } from "zustand";
import type {
  AlertItem,
  ChartComment,
  ChartSettings,
  ChartStyle,
  Drawing,
  DrawingTool,
  NewsItem,
  Opinion,
  PatternDef,
  PatternHit,
  Post,
  PriceWatch,
  SymbolMeta,
  Timeframe,
  WorkspaceLayoutPreset,
} from "@/lib/types";
import { DEFAULT_CHART_SETTINGS } from "@/lib/types";

/** Feature ID: shell.brand — fixed right-panel tab order */
export type RightTab =
  | "watchlist"
  | "news"
  | "recent"
  | "patterns"
  | "posts"
  | "alerts"
  | "commentary";

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
const RECENT_KEY = "chartdesk-recent-v1";
const SETTINGS_KEY = "chartdesk-settings-v1";
const TZ_KEY = "chartdesk-timezone-v1";

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
  news: NewsItem[];
  comments: ChartComment[];
  /** Feature ID: symbol.recent */
  recentSymbolIds: string[];
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
  /** Feature ID: draw.lock_all */
  drawingsLocked: boolean;
  fullscreen: boolean;
  timezone: string;
  goToDate: string | null;
  priceWatches: PriceWatch[];
  layouts: WorkspaceLayoutPreset[];
  /** Feature ID: chart.settings */
  chartSettings: ChartSettings;
  /** Feature ID: chart.undo */
  undoStack: Drawing[][];
  redoStack: Drawing[][];
  objectTreeOpen: boolean;
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
    priceWatches?: PriceWatch[];
    comments?: ChartComment[];
    news?: NewsItem[];
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
  setDrawingsLocked: (v: boolean) => void;
  setFullscreen: (v: boolean) => void;
  setTimezone: (tz: string) => void;
  setGoToDate: (isoDate: string | null) => void;
  upsertPost: (post: Post) => void;
  upsertOpinions: (opinions: Opinion[]) => void;
  setOpinions: (opinions: Opinion[]) => void;
  setPatternHits: (hits: PatternHit[]) => void;
  setPatterns: (patterns: PatternDef[]) => void;
  setAlerts: (alerts: AlertItem[]) => void;
  setDrawings: (drawings: Drawing[], pushUndo?: boolean) => void;
  undoDrawings: () => void;
  redoDrawings: () => void;
  setWatchlist: (ids: string[]) => void;
  setPriceWatches: (watches: PriceWatch[]) => void;
  setComments: (comments: ChartComment[]) => void;
  setNews: (news: NewsItem[]) => void;
  setChartSettings: (partial: Partial<ChartSettings>) => void;
  setObjectTreeOpen: (v: boolean) => void;
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

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeRecent(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 20)));
}

function readSettings(): ChartSettings {
  if (typeof window === "undefined") return DEFAULT_CHART_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw
      ? { ...DEFAULT_CHART_SETTINGS, ...(JSON.parse(raw) as ChartSettings) }
      : DEFAULT_CHART_SETTINGS;
  } catch {
    return DEFAULT_CHART_SETTINGS;
  }
}

function writeSettings(s: ChartSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function readTimezone(): string {
  if (typeof window === "undefined") return "America/New_York";
  try {
    const saved = localStorage.getItem(TZ_KEY);
    if (saved) return saved;
    const detected =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    // Cloud/CI often reports UTC — prefer NY for US equity session badge demo
    if (detected === "UTC" || detected === "Etc/UTC") return "America/New_York";
    return detected;
  } catch {
    return "America/New_York";
  }
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
  news: [],
  comments: [],
  recentSymbolIds: [],
  activeSymbolId: "us_NVDA",
  secondarySymbolIds: ["kr_005930", "crypto_BTCUSDT", "kr_000660"],
  compareSymbolId: null,
  timeframe: "D",
  drawingTool: "none",
  indicators: ["sma20", "ema9"],
  chartStyle: "candle",
  rightTab: "watchlist",
  layoutMode: "single",
  showDisclaimer: true,
  magnet: true,
  drawingsLocked: false,
  fullscreen: false,
  timezone: "America/New_York",
  goToDate: null,
  priceWatches: [],
  layouts: [],
  chartSettings: DEFAULT_CHART_SETTINGS,
  undoStack: [],
  redoStack: [],
  objectTreeOpen: false,
  setReady: (v) => set({ ready: v }),
  hydrate: (data) =>
    set({
      ...data,
      priceWatches: data.priceWatches ?? [],
      comments: data.comments ?? [],
      news: data.news ?? [],
      activeSymbolId:
        data.watchlist.find((id) => id === "us_NVDA") ??
        data.watchlist[0] ??
        data.symbols[0]?.id ??
        "us_NVDA",
      ready: true,
      layouts: readLayouts(),
      recentSymbolIds: readRecent(),
      chartSettings: readSettings(),
      timezone: readTimezone(),
      undoStack: [],
      redoStack: [],
    }),
  setActiveSymbol: (id) => {
    const recent = [id, ...get().recentSymbolIds.filter((x) => x !== id)].slice(
      0,
      20
    );
    writeRecent(recent);
    set({ activeSymbolId: id, recentSymbolIds: recent });
  },
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
  setDrawingsLocked: (v) => set({ drawingsLocked: v }),
  setFullscreen: (v) => set({ fullscreen: v }),
  setTimezone: (tz) => {
    if (typeof window !== "undefined") localStorage.setItem(TZ_KEY, tz);
    set({ timezone: tz });
  },
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
  setDrawings: (drawings, pushUndo = true) => {
    const prev = get().drawings;
    if (pushUndo) {
      set({
        drawings,
        undoStack: [...get().undoStack, prev].slice(-40),
        redoStack: [],
      });
    } else {
      set({ drawings });
    }
  },
  undoDrawings: () => {
    const { undoStack, drawings, redoStack } = get();
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      drawings: prev,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, drawings].slice(-40),
    });
  },
  redoDrawings: () => {
    const { redoStack, drawings, undoStack } = get();
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    set({
      drawings: next,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, drawings].slice(-40),
    });
  },
  setWatchlist: (ids) => set({ watchlist: ids }),
  setPriceWatches: (watches) => set({ priceWatches: watches }),
  setComments: (comments) => set({ comments }),
  setNews: (news) => set({ news }),
  setChartSettings: (partial) => {
    const chartSettings = { ...get().chartSettings, ...partial };
    writeSettings(chartSettings);
    set({ chartSettings });
  },
  setObjectTreeOpen: (v) => set({ objectTreeOpen: v }),
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
