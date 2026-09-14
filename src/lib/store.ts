"use client";

import { create } from "zustand";
import type {
  AlertItem,
  Drawing,
  DrawingTool,
  Opinion,
  PatternDef,
  PatternHit,
  Post,
  SymbolMeta,
  Timeframe,
} from "@/lib/types";

export type RightTab = "watchlist" | "opinions" | "patterns" | "posts" | "alerts";
export type LayoutMode = "single" | "split2" | "split4";
export type IndicatorId = "sma20" | "ema9" | "bb" | "rsi";

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
  timeframe: Timeframe;
  drawingTool: DrawingTool;
  indicators: IndicatorId[];
  rightTab: RightTab;
  layoutMode: LayoutMode;
  showDisclaimer: boolean;
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
  setRightTab: (tab: RightTab) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setSecondarySymbols: (ids: string[]) => void;
  setShowDisclaimer: (v: boolean) => void;
  upsertPost: (post: Post) => void;
  upsertOpinions: (opinions: Opinion[]) => void;
  setOpinions: (opinions: Opinion[]) => void;
  setPatternHits: (hits: PatternHit[]) => void;
  setPatterns: (patterns: PatternDef[]) => void;
  setAlerts: (alerts: AlertItem[]) => void;
  setDrawings: (drawings: Drawing[]) => void;
  setWatchlist: (ids: string[]) => void;
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
  timeframe: "D",
  drawingTool: "none",
  indicators: ["sma20", "ema9"],
  rightTab: "watchlist",
  layoutMode: "single",
  showDisclaimer: true,
  setReady: (v) => set({ ready: v }),
  hydrate: (data) =>
    set({
      ...data,
      activeSymbolId: data.watchlist[0] ?? data.symbols[0]?.id ?? "kr_005930",
      ready: true,
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
  setRightTab: (tab) => set({ rightTab: tab }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  setSecondarySymbols: (ids) => set({ secondarySymbolIds: ids }),
  setShowDisclaimer: (v) => set({ showDisclaimer: v }),
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
}));
