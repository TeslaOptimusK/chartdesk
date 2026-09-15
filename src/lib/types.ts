export type AssetClass = "kr_stock" | "us_stock" | "crypto";

/** Feature IDs: chart.interval / chart.interval.full / chart.interval.custom */
export type Timeframe =
  | "1"
  | "3"
  | "5"
  | "10"
  | "15"
  | "30"
  | "60"
  | "120"
  | "240"
  | "D"
  | "W"
  | "M";

export type PostCategory =
  | "survival_strategy"
  | "realtime_chart"
  | "mindset"
  | "insight";

export type IngestMethod =
  | "manual_paste"
  | "file_drop"
  | "official_api"
  | "webhook"
  | "browser_share";

export type OpinionDirection = "buy" | "sell" | "watch" | "unclear";
export type OpinionStatus = "draft" | "approved" | "rejected";
export type Confidence = "low" | "medium" | "high";

export type AlertType =
  | "price"
  | "pattern"
  | "opinion"
  | "drawing"
  | "indicator"
  | "webhook";

export type DrawingKind =
  | "trend"
  | "horizontal"
  | "horizontal_ray" // Feature ID: draw.horizontal_ray
  | "channel" // Feature ID: draw.parallel_channel
  | "fibonacci"
  | "rectangle"
  | "text"
  | "vertical" // Feature ID: draw.vertical_line
  | "ray" // Feature ID: draw.ray
  | "extended" // Feature ID: draw.extended_line
  | "long_position" // Feature ID: draw.long_position
  | "short_position" // Feature ID: draw.short_position
  | "vp_fixed" // Feature ID: draw.vp.fixed_range
  | "anchored_vwap" // Feature ID: draw.anchored_vwap
  | "measure";

export type DrawingTool = "none" | DrawingKind;

/** Feature ID: alert.price.* */
export type PriceWatchOp = "above" | "below" | "crossing";

/** Feature ID: alert.technical.* */
export type TechnicalAlertKind = "drawing" | "indicator";

export type ChartStyle =
  | "candle"
  | "bar" // Feature ID: chart.type.bars
  | "hollow_candle" // Feature ID: chart.type.hollow_candles
  | "line"
  | "area" // Feature ID: chart.type.area
  | "baseline" // Feature ID: chart.type.baseline
  | "heikin_ashi";

/** Feature ID: scale.log / scale.percent / scale.indexed_100 */
export type PriceScaleMode = "linear" | "log" | "percent" | "indexed_100";

/** Feature ID: chart.range_preset */
export type RangePreset = "1D" | "5D" | "1M" | "1Y" | "ALL";

/** Feature ID: chart.date_format */
export type DateFormat = "mm/dd/yyyy" | "yyyy-mm-dd" | "dd/mm/yyyy";

export type CalendarKind = "eco" | "earnings";

export type ChartEventKind = "earnings" | "dividends" | "splits" | "news";

export interface SymbolMeta {
  id: string;
  ticker: string;
  exchange: string;
  nameKo: string;
  nameEn: string;
  assetClass: AssetClass;
  aliases: string[];
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Post {
  id: string;
  externalUrl: string;
  category: PostCategory;
  title: string;
  body: string;
  publishedAt: string;
  source: "fanding_easychart";
  ingestMethod: IngestMethod;
  symbolIds: string[];
  createdAt: string;
}

export interface Opinion {
  id: string;
  symbolId: string;
  direction: OpinionDirection;
  confidence: Confidence;
  summary: string;
  rationale: string[];
  risks: string[];
  sourcePostId: string;
  category: PostCategory;
  status: OpinionStatus;
  chartAnchor?: { fromTs: number; toTs: number };
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface PatternRule {
  type:
    | "ma_cross"
    | "swing_low_pair"
    | "support_bounce"
    | "rsi_oversold"
    | "bullish_engulfing"
    | "neckline_break"
    | "volume_spike";
  params?: Record<string, number | string | boolean>;
}

export interface PatternDef {
  id: string;
  name: string;
  description: string;
  sourcePostIds: string[];
  timeframes: Timeframe[];
  rules: PatternRule[];
  display: { label: string; color: string };
  alert: { cooldownMinutes: number };
  enabled: boolean;
  dsl?: string;
}

export interface PatternHit {
  id: string;
  patternId: string;
  symbolId: string;
  timeframe: Timeframe;
  fromTs: number;
  toTs: number;
  score: number;
  label: string;
  createdAt: string;
  feedback?: "correct" | "incorrect";
}

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  symbolId: string;
  tool: DrawingKind;
  /** Persist as {time, price} — never pixel coords */
  points: DrawingPoint[];
  color: string;
  /** Text memo body (tool === "text") */
  text?: string;
  locked?: boolean;
  createdAt: string;
}

export interface PriceWatch {
  id: string;
  symbolId: string;
  price: number;
  op: PriceWatchOp;
  /** Feature ID: alert.message */
  message?: string;
  createdAt: string;
  triggered?: boolean;
  /** Prior close for crossing evaluation */
  lastClose?: number;
}

/** Feature ID: chart.settings + chart.canvas */
export interface ChartSettings {
  background: string;
  gridColor: string;
  upColor: string;
  downColor: string;
  showGrid: boolean;
  /** Feature ID: chart.canvas — watermark text */
  watermark: string;
  showWatermark: boolean;
}

export interface TechnicalAlert {
  id: string;
  kind: TechnicalAlertKind;
  symbolId: string;
  /** drawing id or indicator id */
  targetId: string;
  label: string;
  message?: string;
  createdAt: string;
  triggered?: boolean;
}

export interface WebhookConfig {
  /** Feature ID: alert.webhook */
  url: string;
  enabled: boolean;
}

export interface CalendarEvent {
  id: string;
  kind: CalendarKind;
  title: string;
  at: string;
  symbolId?: string;
  impact?: "low" | "medium" | "high";
}

export interface ChartEventMarker {
  id: string;
  kind: ChartEventKind;
  symbolId: string;
  time: number;
  title: string;
  detail?: string;
}

export interface IndicatorTemplate {
  id: string;
  name: string;
  indicators: string[];
}

export interface ChartComment {
  id: string;
  symbolId: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface NewsItem {
  id: string;
  symbolId?: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
}

export interface WorkspaceLayoutPreset {
  id: string;
  name: string;
  symbolId: string;
  compareSymbolId: string | null;
  timeframe: Timeframe;
  chartStyle: ChartStyle;
  indicators: string[];
  layoutMode: "single" | "split2" | "split4";
  magnet: boolean;
  savedAt: string;
}

export interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  symbolId?: string;
  patternId?: string;
  opinionId?: string;
  firedAt: string;
  read: boolean;
}

export interface AppStoreData {
  symbols: SymbolMeta[];
  posts: Post[];
  opinions: Opinion[];
  patterns: PatternDef[];
  patternHits: PatternHit[];
  drawings: Drawing[];
  alerts: AlertItem[];
  watchlist: string[];
  /** Feature ID: alert.price — server-side watch definitions */
  priceWatches: PriceWatch[];
  /** Feature ID: note / commentary tab */
  comments: ChartComment[];
  news: NewsItem[];
  /** Feature ID: alert.technical.* */
  technicalAlerts: TechnicalAlert[];
  /** Feature ID: alert.webhook */
  webhookConfig: WebhookConfig;
}

export const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  url: "",
  enabled: false,
};

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  background: "#0c1219",
  gridColor: "#16202b",
  upColor: "#26a69a",
  downColor: "#ef5350",
  showGrid: true,
  watermark: "ChartDesk",
  showWatermark: true,
};

/** Feature ID: indicator.template — EMA 20/50/200 preset */
export const INDICATOR_TEMPLATES: IndicatorTemplate[] = [
  {
    id: "tpl_ema_stack",
    name: "EMA 20/50/200",
    indicators: ["ema20", "ema50", "ema200"],
  },
  {
    id: "tpl_trend",
    name: "추세 기본",
    indicators: ["sma20", "ema9", "bb", "volume"],
  },
  {
    id: "tpl_momentum",
    name: "모멘텀",
    indicators: ["rsi", "macd", "stoch"],
  },
];

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1": "1분",
  "3": "3분",
  "5": "5분",
  "10": "10분",
  "15": "15분",
  "30": "30분",
  "60": "1시간",
  "120": "2시간",
  "240": "4시간",
  D: "일봉",
  W: "주봉",
  M: "월봉",
};

/** Feature ID: chart.interval.full — default picker order */
export const ALL_TIMEFRAMES: Timeframe[] = [
  "1",
  "3",
  "5",
  "10",
  "15",
  "30",
  "60",
  "120",
  "240",
  "D",
  "W",
  "M",
];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  "1D": "1D",
  "5D": "5D",
  "1M": "1M",
  "1Y": "1Y",
  ALL: "All",
};

/** Feature ID: symbol.chips */
export const SYMBOL_CHIP_IDS = [
  "idx_SPX500",
  "us_SPY",
  "us_QQQ",
  "idx_MAG7",
  "idx_SOX",
  "us_VNQ",
  "us_VNPA",
] as const;

export const CATEGORY_LABELS: Record<PostCategory, string> = {
  survival_strategy: "비밀 생존 전략",
  realtime_chart: "실시간 차트 분석",
  mindset: "마인드셋",
  insight: "인사이트",
};

export const DIRECTION_LABELS: Record<OpinionDirection, string> = {
  buy: "매수",
  sell: "매도",
  watch: "관망",
  unclear: "불명확",
};
