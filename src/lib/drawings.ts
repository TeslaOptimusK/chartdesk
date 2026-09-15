import type { Drawing, DrawingKind, DrawingPoint } from "@/lib/types";

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const DRAWING_TOOL_META: {
  id: DrawingKind;
  label: string;
  clicks: number;
  hint: string;
  featureId?: string;
}[] = [
  {
    id: "trend",
    label: "추세선",
    clicks: 2,
    hint: "시작점 → 끝점",
    featureId: "draw.trendline",
  },
  {
    id: "ray",
    label: "레이",
    clicks: 2,
    hint: "시작 → 방향(무한 연장)",
    featureId: "draw.ray",
  },
  {
    id: "extended",
    label: "연장선",
    clicks: 2,
    hint: "양방향 무한 연장",
    featureId: "draw.extended_line",
  },
  {
    id: "horizontal",
    label: "수평선",
    clicks: 1,
    hint: "가격 클릭",
    featureId: "draw.horizontal_line",
  },
  {
    id: "horizontal_ray",
    label: "수평 레이",
    clicks: 1,
    hint: "가격 클릭 → 우측 무한",
    featureId: "draw.horizontal_ray",
  },
  {
    id: "vertical",
    label: "수직선",
    clicks: 1,
    hint: "시간 클릭",
    featureId: "draw.vertical_line",
  },
  {
    id: "channel",
    label: "평행 채널",
    clicks: 3,
    hint: "기준선 2점 → 폭",
    featureId: "draw.parallel_channel",
  },
  {
    id: "fibonacci",
    label: "피보나치",
    clicks: 2,
    hint: "고점 ↔ 저점",
    featureId: "draw.fib.retracement",
  },
  {
    id: "fib_extension",
    label: "피보나치 확장",
    clicks: 2,
    hint: "스윙 2점",
    featureId: "draw.fib.extension",
  },
  {
    id: "fib_fan",
    label: "피보나치 부채",
    clicks: 2,
    hint: "원점 → 끝",
    featureId: "draw.fib.fan",
  },
  {
    id: "fib_arc",
    label: "피보나치 호",
    clicks: 2,
    hint: "반경 2점",
    featureId: "draw.fib.arc",
  },
  {
    id: "fib_timezone",
    label: "피보나치 시간",
    clicks: 2,
    hint: "구간 2점",
    featureId: "draw.fib.timezone",
  },
  {
    id: "gann_box",
    label: "간 박스",
    clicks: 2,
    hint: "대각 2점",
    featureId: "draw.gann.box",
  },
  {
    id: "gann_fan",
    label: "간 부채",
    clicks: 2,
    hint: "원점 → 각도",
    featureId: "draw.gann.fan",
  },
  {
    id: "pattern_harmonic",
    label: "하모닉",
    clicks: 5,
    hint: "XABCD 5점",
    featureId: "draw.pattern.harmonic",
  },
  {
    id: "pattern_elliott",
    label: "엘리엇",
    clicks: 5,
    hint: "5파 5점",
    featureId: "draw.pattern.elliott",
  },
  {
    id: "pitchfork",
    label: "피치포크",
    clicks: 3,
    hint: "A → B → C",
    featureId: "draw.pitchfork",
  },
  {
    id: "brush",
    label: "브러시",
    clicks: 999,
    hint: "드래그로 자유곡선",
    featureId: "draw.brush",
  },
  {
    id: "rectangle",
    label: "사각형",
    clicks: 2,
    hint: "모서리 2점",
    featureId: "draw.rectangle",
  },
  {
    id: "long_position",
    label: "롱 포지션",
    clicks: 3,
    hint: "진입 → 목표 → 손절",
    featureId: "draw.long_position",
  },
  {
    id: "short_position",
    label: "숏 포지션",
    clicks: 3,
    hint: "진입 → 목표 → 손절",
    featureId: "draw.short_position",
  },
  {
    id: "vp_fixed",
    label: "고정 VP",
    clicks: 2,
    hint: "구간 2점",
    featureId: "draw.vp.fixed_range",
  },
  {
    id: "anchored_vwap",
    label: "앵커 VWAP",
    clicks: 1,
    hint: "앵커 시점",
    featureId: "draw.anchored_vwap",
  },
  {
    id: "measure",
    label: "측정",
    clicks: 2,
    hint: "구간 거리·등락률",
    featureId: "draw.measure",
  },
  {
    id: "text",
    label: "텍스트",
    clicks: 1,
    hint: "위치 클릭 후 메모",
    featureId: "draw.text",
  },
];

export function clicksRequired(tool: DrawingKind): number {
  const meta = DRAWING_TOOL_META.find((t) => t.id === tool);
  if (tool === "brush") return 999;
  return meta?.clicks ?? 1;
}

export function isBrushTool(tool: DrawingKind): boolean {
  return tool === "brush";
}

export function defaultColor(tool: DrawingKind): string {
  switch (tool) {
    case "trend":
      return "#38bdf8";
    case "ray":
    case "extended":
      return "#7dd3fc";
    case "horizontal":
      return "#fbbf24";
    case "horizontal_ray":
      return "#f59e0b";
    case "vertical":
      return "#fcd34d";
    case "channel":
      return "#34d399";
    case "fibonacci":
    case "fib_extension":
    case "fib_fan":
    case "fib_arc":
    case "fib_timezone":
      return "#c084fc";
    case "gann_box":
    case "gann_fan":
      return "#818cf8";
    case "pattern_harmonic":
    case "pattern_elliott":
      return "#2dd4bf";
    case "pitchfork":
      return "#f472b6";
    case "brush":
      return "#94a3b8";
    case "rectangle":
      return "#fb7185";
    case "long_position":
      return "#22c55e";
    case "short_position":
      return "#f43f5e";
    case "vp_fixed":
      return "#a78bfa";
    case "anchored_vwap":
      return "#f472b6";
    case "measure":
      return "#a3e635";
    case "text":
      return "#e8b86d";
    default:
      return "#94a3b8";
  }
}

export function priceOnSegment(
  p0: DrawingPoint,
  p1: DrawingPoint,
  time: number
): number {
  if (p1.time === p0.time) return p0.price;
  const t = (time - p0.time) / (p1.time - p0.time);
  return p0.price + (p1.price - p0.price) * t;
}

export function channelOffset(
  p0: DrawingPoint,
  p1: DrawingPoint,
  p2: DrawingPoint
): number {
  return p2.price - priceOnSegment(p0, p1, p2.time);
}

export function fibPrices(p0: DrawingPoint, p1: DrawingPoint): number[] {
  return FIB_LEVELS.map((lvl) => p0.price + (p1.price - p0.price) * lvl);
}

export function isCompleteDrawing(
  d: Pick<Drawing, "tool" | "points" | "text">
): boolean {
  if (d.tool === "brush") return d.points.length >= 2;
  if (d.points.length < clicksRequired(d.tool)) return false;
  if (d.tool === "text" && !d.text?.trim()) return false;
  return true;
}
