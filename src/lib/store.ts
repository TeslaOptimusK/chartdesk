"use client";

import { create } from "zustand";
import type {
  AlertItem,
  CalendarEvent,
  ChartComment,
  ChartEventKind,
  ChartSettings,
  ChartStyle,
  DateFormat,
  Drawing,
  DrawingKind,
  DrawingTool,
  NewsItem,
  Opinion,
  PatternDef,
  PatternHit,
  Post,
  PriceScaleMode,
  PriceWatch,
  RangePreset,
  SymbolMeta,
  MultiConditionAlert,
  PaperAccount,
  TechnicalAlert,
  Timeframe,
  WebhookConfig,
  WorkspaceLayoutPreset,
} from "@/lib/types";
import { DEFAULT_PAPER_ACCOUNT } from "@/lib/types";
import {
  DEFAULT_CHART_SETTINGS,
  DEFAULT_WEBHOOK_CONFIG,
  INDICATOR_TEMPLATES,
} from "@/lib/types";
import { buildCalendarEvents } from "@/lib/phase2-data";
import {
  DEFAULT_EASY_TOGGLES,
  type EasyOverlayPreset,
  type EasyOverlayToggles,
} from "@/lib/easychart/types";

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
/** Built-in overlay / pane indicators (Phase 2 favorites in checklist §7.2) */
export type IndicatorId =
  | "sma20"
  | "ema9"
  | "ema20"
  | "ema50"
  | "ema200"
  | "wma"
  | "bb"
  | "ichimoku"
  | "supertrend"
  | "rsi"
  | "macd"
  | "stoch"
  | "atr"
  | "vwap"
  | "volMa"
  | "volume";

/** Feature ID: layout.sync.* */
export interface LayoutSyncFlags {
  symbol: boolean;
  interval: boolean;
  crosshair: boolean;
  drawings: boolean;
}

/** Feature ID: events.* toggles */
export type EventToggleMap = Record<ChartEventKind, boolean>;

const LAYOUT_KEY = "chartdesk-layouts-v1";
const RECENT_KEY = "chartdesk-recent-v1";
const SETTINGS_KEY = "chartdesk-settings-v1";
const TZ_KEY = "chartdesk-timezone-v1";
const PHASE2_KEY = "chartdesk-phase2-v1";
const PHASE3_KEY = "chartdesk-phase3-v1";
const PHASE4_KEY = "chartdesk-phase4-v1";
const EASY_KEY = "chartdesk-easychart-overlay-v2";

interface EasyOverlayPrefs {
  enabled: boolean;
  toggles: EasyOverlayToggles;
  preset: EasyOverlayPreset;
}

const DEFAULT_EASY: EasyOverlayPrefs = {
  enabled: true,
  toggles: { ...DEFAULT_EASY_TOGGLES },
  preset: "scalp",
};

function readEasyPrefs(): EasyOverlayPrefs {
  if (typeof window === "undefined") return DEFAULT_EASY;
  try {
    const raw = localStorage.getItem(EASY_KEY);
    if (!raw) return DEFAULT_EASY;
    const parsed = JSON.parse(raw) as Partial<EasyOverlayPrefs>;
    return {
      enabled: parsed.enabled ?? DEFAULT_EASY.enabled,
      toggles: { ...DEFAULT_EASY_TOGGLES, ...parsed.toggles },
      preset: parsed.preset ?? DEFAULT_EASY.preset,
    };
  } catch {
    return DEFAULT_EASY;
  }
}

function writeEasyPrefs(partial: Partial<EasyOverlayPrefs>) {
  if (typeof window === "undefined") return;
  const cur = readEasyPrefs();
  localStorage.setItem(EASY_KEY, JSON.stringify({ ...cur, ...partial }));
}

/** Feature ID: indicator.on_indicator */
export interface IndicatorOnIndicatorConfig {
  parent: "rsi";
  child: "sma20";
}

export interface Phase3Prefs {
  indicatorOnIndicator: IndicatorOnIndicatorConfig | null;
  customIndicatorSource: string;
  activeCustomScriptId: string | null;
  screenerOpen: boolean;
  heatmapOpen: boolean;
  paperOpen: boolean;
  fundGraphsOpen: boolean;
  portfolioOpen: boolean;
  seasonalsOpen: boolean;
  customIndicatorOpen: boolean;
}

const DEFAULT_PHASE3: Phase3Prefs = {
  indicatorOnIndicator: null,
  customIndicatorSource: "",
  activeCustomScriptId: null,
  screenerOpen: false,
  heatmapOpen: false,
  paperOpen: false,
  fundGraphsOpen: false,
  portfolioOpen: false,
  seasonalsOpen: false,
  customIndicatorOpen: false,
};

export interface Phase4Prefs {
  optionsOpen: boolean;
  yieldOpen: boolean;
  macroOpen: boolean;
  brokerOpen: boolean;
  domOpen: boolean;
}

const DEFAULT_PHASE4: Phase4Prefs = {
  optionsOpen: false,
  yieldOpen: false,
  macroOpen: false,
  brokerOpen: false,
  domOpen: false,
};

export interface Phase2Prefs {
  priceScaleMode: PriceScaleMode;
  rangePreset: RangePreset;
  dateFormat: DateFormat;
  extendedHours: boolean;
  sync: LayoutSyncFlags;
  favoriteTools: DrawingKind[];
  stayInDrawMode: boolean;
  showCountdown: boolean;
  customIntervalMinutes: number | null;
  eventToggles: EventToggleMap;
}

const DEFAULT_SYNC: LayoutSyncFlags = {
  symbol: true,
  interval: true,
  crosshair: false,
  drawings: true,
};

const DEFAULT_EVENT_TOGGLES: EventToggleMap = {
  earnings: true,
  dividends: true,
  splits: true,
  news: true,
};

const DEFAULT_PHASE2: Phase2Prefs = {
  priceScaleMode: "linear",
  rangePreset: "ALL",
  dateFormat: "mm/dd/yyyy",
  extendedHours: false,
  sync: DEFAULT_SYNC,
  favoriteTools: ["trend", "horizontal", "ray"],
  stayInDrawMode: false,
  showCountdown: true,
  customIntervalMinutes: null,
  eventToggles: DEFAULT_EVENT_TOGGLES,
};

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
  /** Feature ID: scale.log / scale.percent / scale.indexed_100 */
  priceScaleMode: PriceScaleMode;
  /** Feature ID: chart.range_preset */
  rangePreset: RangePreset;
  /** Feature ID: chart.date_format */
  dateFormat: DateFormat;
  /** Feature ID: chart.extended_hours */
  extendedHours: boolean;
  /** Feature ID: layout.sync.* */
  sync: LayoutSyncFlags;
  /** Feature ID: draw.favorites */
  favoriteTools: DrawingKind[];
  /** Feature ID: draw.stay_in_mode */
  stayInDrawMode: boolean;
  /** Feature ID: replay */
  replayActive: boolean;
  replayIndex: number | null;
  replayTotalBars: number;
  /** Feature ID: indicator.dialog */
  indicatorDialogOpen: boolean;
  /** Feature ID: shell.command_palette */
  commandPaletteOpen: boolean;
  /** Feature ID: chart.interval.custom */
  customIntervalMinutes: number | null;
  /** Feature ID: events.* */
  eventToggles: EventToggleMap;
  /** Feature ID: alert.webhook */
  webhookConfig: WebhookConfig;
  /** Feature ID: alert.technical.* */
  technicalAlerts: TechnicalAlert[];
  /** Feature ID: calendar.eco / calendar.earnings */
  calendarEvents: CalendarEvent[];
  /** Feature ID: scale.countdown */
  showCountdown: boolean;
  /** Feature ID: layout.sync.crosshair — shared crosshair time (unix sec) */
  sharedCrosshairTime: number | null;
  /** Feature ID: chart.snapshot — increment to trigger capture */
  snapshotTick: number;
  /** Phase 3 */
  indicatorOnIndicator: IndicatorOnIndicatorConfig | null;
  customIndicatorSource: string;
  multiConditionAlerts: MultiConditionAlert[];
  paperAccount: PaperAccount;
  screenerOpen: boolean;
  heatmapOpen: boolean;
  paperOpen: boolean;
  fundGraphsOpen: boolean;
  portfolioOpen: boolean;
  seasonalsOpen: boolean;
  customIndicatorOpen: boolean;
  optionsOpen: boolean;
  yieldOpen: boolean;
  macroOpen: boolean;
  brokerOpen: boolean;
  domOpen: boolean;
  setIndicatorOnIndicator: (cfg: IndicatorOnIndicatorConfig | null) => void;
  setCustomIndicatorSource: (src: string) => void;
  setMultiConditionAlerts: (alerts: MultiConditionAlert[]) => void;
  setPaperAccount: (account: PaperAccount) => void;
  setScreenerOpen: (v: boolean) => void;
  setHeatmapOpen: (v: boolean) => void;
  setPaperOpen: (v: boolean) => void;
  setFundGraphsOpen: (v: boolean) => void;
  setPortfolioOpen: (v: boolean) => void;
  setSeasonalsOpen: (v: boolean) => void;
  setCustomIndicatorOpen: (v: boolean) => void;
  setOptionsOpen: (v: boolean) => void;
  setYieldOpen: (v: boolean) => void;
  setMacroOpen: (v: boolean) => void;
  setBrokerOpen: (v: boolean) => void;
  setDomOpen: (v: boolean) => void;
  /** easychart pattern overlay (Phase 1) */
  easyOverlayEnabled: boolean;
  easyOverlayToggles: EasyOverlayToggles;
  easyOverlayPreset: EasyOverlayPreset;
  setEasyOverlayEnabled: (v: boolean) => void;
  setEasyOverlayToggle: (key: keyof EasyOverlayToggles, v: boolean) => void;
  setEasyOverlayPreset: (p: EasyOverlayPreset) => void;
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
    technicalAlerts?: TechnicalAlert[];
    webhookConfig?: WebhookConfig;
    multiConditionAlerts?: MultiConditionAlert[];
    paperAccount?: PaperAccount;
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
  setPriceScaleMode: (mode: PriceScaleMode) => void;
  setRangePreset: (preset: RangePreset) => void;
  setDateFormat: (fmt: DateFormat) => void;
  setExtendedHours: (v: boolean) => void;
  setSync: (partial: Partial<LayoutSyncFlags>) => void;
  toggleFavoriteTool: (tool: DrawingKind) => void;
  setStayInDrawMode: (v: boolean) => void;
  setReplayActive: (v: boolean) => void;
  setReplayIndex: (idx: number | null) => void;
  setReplayTotalBars: (n: number) => void;
  setIndicatorDialogOpen: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setCustomIntervalMinutes: (m: number | null) => void;
  setEventToggles: (partial: Partial<EventToggleMap>) => void;
  setWebhookConfig: (partial: Partial<WebhookConfig>) => void;
  setTechnicalAlerts: (alerts: TechnicalAlert[]) => void;
  setShowCountdown: (v: boolean) => void;
  setSharedCrosshairTime: (t: number | null) => void;
  /** Feature ID: indicator.template */
  applyIndicatorTemplate: (templateId: string) => void;
  setIndicators: (ids: IndicatorId[]) => void;
  requestSnapshot: () => void;
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

function readPhase2(): Phase2Prefs {
  if (typeof window === "undefined") return DEFAULT_PHASE2;
  try {
    const raw = localStorage.getItem(PHASE2_KEY);
    if (!raw) return DEFAULT_PHASE2;
    const parsed = JSON.parse(raw) as Partial<Phase2Prefs>;
    return {
      ...DEFAULT_PHASE2,
      ...parsed,
      sync: { ...DEFAULT_SYNC, ...parsed.sync },
      eventToggles: { ...DEFAULT_EVENT_TOGGLES, ...parsed.eventToggles },
    };
  } catch {
    return DEFAULT_PHASE2;
  }
}

function writePhase2(partial: Partial<Phase2Prefs>) {
  if (typeof window === "undefined") return;
  const cur = readPhase2();
  localStorage.setItem(PHASE2_KEY, JSON.stringify({ ...cur, ...partial }));
}

function readPhase3(): Phase3Prefs {
  if (typeof window === "undefined") return DEFAULT_PHASE3;
  try {
    const raw = localStorage.getItem(PHASE3_KEY);
    if (!raw) return DEFAULT_PHASE3;
    return { ...DEFAULT_PHASE3, ...(JSON.parse(raw) as Partial<Phase3Prefs>) };
  } catch {
    return DEFAULT_PHASE3;
  }
}

function writePhase3(partial: Partial<Phase3Prefs>) {
  if (typeof window === "undefined") return;
  const cur = readPhase3();
  localStorage.setItem(PHASE3_KEY, JSON.stringify({ ...cur, ...partial }));
}

function readPhase4(): Phase4Prefs {
  if (typeof window === "undefined") return DEFAULT_PHASE4;
  try {
    const raw = localStorage.getItem(PHASE4_KEY);
    if (!raw) return DEFAULT_PHASE4;
    return { ...DEFAULT_PHASE4, ...(JSON.parse(raw) as Partial<Phase4Prefs>) };
  } catch {
    return DEFAULT_PHASE4;
  }
}

function writePhase4(partial: Partial<Phase4Prefs>) {
  if (typeof window === "undefined") return;
  const cur = readPhase4();
  localStorage.setItem(PHASE4_KEY, JSON.stringify({ ...cur, ...partial }));
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
  priceScaleMode: DEFAULT_PHASE2.priceScaleMode,
  rangePreset: DEFAULT_PHASE2.rangePreset,
  dateFormat: DEFAULT_PHASE2.dateFormat,
  extendedHours: DEFAULT_PHASE2.extendedHours,
  sync: DEFAULT_SYNC,
  favoriteTools: DEFAULT_PHASE2.favoriteTools,
  stayInDrawMode: DEFAULT_PHASE2.stayInDrawMode,
  replayActive: false,
  replayIndex: null,
  replayTotalBars: 200,
  indicatorDialogOpen: false,
  commandPaletteOpen: false,
  customIntervalMinutes: null,
  eventToggles: DEFAULT_EVENT_TOGGLES,
  webhookConfig: DEFAULT_WEBHOOK_CONFIG,
  technicalAlerts: [],
  calendarEvents: buildCalendarEvents(),
  showCountdown: DEFAULT_PHASE2.showCountdown,
  sharedCrosshairTime: null,
  snapshotTick: 0,
  indicatorOnIndicator: null,
  customIndicatorSource: "",
  multiConditionAlerts: [],
  paperAccount: { ...DEFAULT_PAPER_ACCOUNT },
  screenerOpen: false,
  heatmapOpen: false,
  paperOpen: false,
  fundGraphsOpen: false,
  portfolioOpen: false,
  seasonalsOpen: false,
  customIndicatorOpen: false,
  optionsOpen: false,
  yieldOpen: false,
  macroOpen: false,
  brokerOpen: false,
  domOpen: false,
  easyOverlayEnabled: true,
  easyOverlayToggles: { ...DEFAULT_EASY_TOGGLES },
  easyOverlayPreset: "scalp" as EasyOverlayPreset,
  setIndicatorOnIndicator: (cfg) => {
    writePhase3({ indicatorOnIndicator: cfg });
    set({ indicatorOnIndicator: cfg });
  },
  setCustomIndicatorSource: (src) => {
    writePhase3({ customIndicatorSource: src });
    set({ customIndicatorSource: src });
  },
  setMultiConditionAlerts: (multiConditionAlerts) => set({ multiConditionAlerts }),
  setPaperAccount: (paperAccount) => set({ paperAccount }),
  setScreenerOpen: (v) => {
    writePhase3({ screenerOpen: v });
    set({ screenerOpen: v });
  },
  setHeatmapOpen: (v) => {
    writePhase3({ heatmapOpen: v });
    set({ heatmapOpen: v });
  },
  setPaperOpen: (v) => {
    writePhase3({ paperOpen: v });
    set({ paperOpen: v });
  },
  setFundGraphsOpen: (v) => {
    writePhase3({ fundGraphsOpen: v });
    set({ fundGraphsOpen: v });
  },
  setPortfolioOpen: (v) => {
    writePhase3({ portfolioOpen: v });
    set({ portfolioOpen: v });
  },
  setSeasonalsOpen: (v) => {
    writePhase3({ seasonalsOpen: v });
    set({ seasonalsOpen: v });
  },
  setCustomIndicatorOpen: (v) => {
    writePhase3({ customIndicatorOpen: v });
    set({ customIndicatorOpen: v });
  },
  setOptionsOpen: (v) => {
    writePhase4({ optionsOpen: v });
    set({ optionsOpen: v });
  },
  setYieldOpen: (v) => {
    writePhase4({ yieldOpen: v });
    set({ yieldOpen: v });
  },
  setMacroOpen: (v) => {
    writePhase4({ macroOpen: v });
    set({ macroOpen: v });
  },
  setBrokerOpen: (v) => {
    writePhase4({ brokerOpen: v });
    set({ brokerOpen: v });
  },
  setDomOpen: (v) => {
    writePhase4({ domOpen: v });
    set({ domOpen: v });
  },
  setEasyOverlayEnabled: (v) => {
    writeEasyPrefs({ enabled: v });
    set({ easyOverlayEnabled: v });
  },
  setEasyOverlayToggle: (key, v) => {
    const toggles = { ...get().easyOverlayToggles, [key]: v };
    writeEasyPrefs({ toggles });
    set({ easyOverlayToggles: toggles });
  },
  setEasyOverlayPreset: (p) => {
    writeEasyPrefs({ preset: p });
    set({ easyOverlayPreset: p });
  },
  setReady: (v) => set({ ready: v }),
  hydrate: (data) => {
    const p2 = readPhase2();
    const p3 = readPhase3();
    const p4 = readPhase4();
    const easy = readEasyPrefs();
    set({
      ...data,
      priceWatches: data.priceWatches ?? [],
      easyOverlayEnabled: easy.enabled,
      easyOverlayToggles: easy.toggles,
      easyOverlayPreset: easy.preset,
      comments: data.comments ?? [],
      news: data.news ?? [],
      technicalAlerts: data.technicalAlerts ?? [],
      webhookConfig: data.webhookConfig ?? DEFAULT_WEBHOOK_CONFIG,
      multiConditionAlerts: data.multiConditionAlerts ?? [],
      paperAccount: data.paperAccount ?? { ...DEFAULT_PAPER_ACCOUNT },
      indicatorOnIndicator: p3.indicatorOnIndicator,
      customIndicatorSource: p3.customIndicatorSource,
      screenerOpen: p3.screenerOpen,
      heatmapOpen: p3.heatmapOpen,
      paperOpen: p3.paperOpen,
      fundGraphsOpen: p3.fundGraphsOpen,
      portfolioOpen: p3.portfolioOpen,
      seasonalsOpen: p3.seasonalsOpen,
      customIndicatorOpen: p3.customIndicatorOpen,
      optionsOpen: p4.optionsOpen,
      yieldOpen: p4.yieldOpen,
      macroOpen: p4.macroOpen,
      brokerOpen: p4.brokerOpen,
      domOpen: p4.domOpen,
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
      priceScaleMode: p2.priceScaleMode,
      rangePreset: p2.rangePreset,
      dateFormat: p2.dateFormat,
      extendedHours: p2.extendedHours,
      sync: p2.sync,
      favoriteTools: p2.favoriteTools,
      stayInDrawMode: p2.stayInDrawMode,
      showCountdown: p2.showCountdown,
      customIntervalMinutes: p2.customIntervalMinutes,
      eventToggles: p2.eventToggles,
      calendarEvents: buildCalendarEvents(),
    });
  },
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
  setPriceScaleMode: (mode) => {
    writePhase2({ priceScaleMode: mode });
    set({ priceScaleMode: mode });
  },
  setRangePreset: (preset) => {
    writePhase2({ rangePreset: preset });
    set({ rangePreset: preset });
  },
  setDateFormat: (fmt) => {
    writePhase2({ dateFormat: fmt });
    set({ dateFormat: fmt });
  },
  setExtendedHours: (v) => {
    writePhase2({ extendedHours: v });
    set({ extendedHours: v });
  },
  setSync: (partial) => {
    const sync = { ...get().sync, ...partial };
    writePhase2({ sync });
    set({ sync });
  },
  toggleFavoriteTool: (tool) => {
    const cur = get().favoriteTools;
    const favoriteTools = cur.includes(tool)
      ? cur.filter((t) => t !== tool)
      : [...cur, tool];
    writePhase2({ favoriteTools });
    set({ favoriteTools });
  },
  setStayInDrawMode: (v) => {
    writePhase2({ stayInDrawMode: v });
    set({ stayInDrawMode: v });
  },
  setReplayActive: (v) =>
    set({ replayActive: v, replayIndex: v ? get().replayIndex : null }),
  setReplayIndex: (idx) => set({ replayIndex: idx }),
  setReplayTotalBars: (replayTotalBars) => set({ replayTotalBars }),
  setIndicatorDialogOpen: (v) => set({ indicatorDialogOpen: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setCustomIntervalMinutes: (m) => {
    writePhase2({ customIntervalMinutes: m });
    set({ customIntervalMinutes: m });
  },
  setEventToggles: (partial) => {
    const eventToggles = { ...get().eventToggles, ...partial };
    writePhase2({ eventToggles });
    set({ eventToggles });
  },
  setWebhookConfig: (partial) => {
    const webhookConfig = { ...get().webhookConfig, ...partial };
    set({ webhookConfig });
  },
  setTechnicalAlerts: (technicalAlerts) => set({ technicalAlerts }),
  setShowCountdown: (v) => {
    writePhase2({ showCountdown: v });
    set({ showCountdown: v });
  },
  setSharedCrosshairTime: (t) => set({ sharedCrosshairTime: t }),
  applyIndicatorTemplate: (templateId) => {
    const tpl = INDICATOR_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    set({ indicators: tpl.indicators as IndicatorId[] });
  },
  setIndicators: (ids) => set({ indicators: ids }),
  requestSnapshot: () =>
    set({ snapshotTick: get().snapshotTick + 1 }),
}));
