export type AssetClass = "kr_stock" | "us_stock" | "crypto";

export type Timeframe = "1" | "5" | "15" | "60" | "240" | "D";

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

export type AlertType = "price" | "pattern" | "opinion";

export type DrawingTool = "none" | "trend" | "horizontal";

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

export interface Drawing {
  id: string;
  symbolId: string;
  tool: "trend" | "horizontal";
  points: { time: number; price: number }[];
  color: string;
  createdAt: string;
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
}

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

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1": "1분",
  "5": "5분",
  "15": "15분",
  "60": "1시간",
  "240": "4시간",
  D: "일봉",
};
