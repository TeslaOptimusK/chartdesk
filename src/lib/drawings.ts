import type { Drawing, DrawingKind, DrawingPoint } from "@/lib/types";

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export const DRAWING_TOOL_META: {
  id: DrawingKind;
  label: string;
  clicks: number;
  hint: string;
  /** Feature ID string when distinct from tool id */
  featureId?: string;
}[] = [
  {
    id: "trend",
    label: "추세선",
    clicks: 2,
    hint: "시작점 → 끝점",
    featureId: "draw.trendline",
  },
  { id: "ray", label: "레이", clicks: 2, hint: "시작 → 방향(무한 연장)" },
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
  { id: "vertical", label: "수직선", clicks: 1, hint: "시간 클릭" },
  {
    id: "channel",
    label: "평행 채널",
    clicks: 3,
    hint: "기준선 2점 → 폭(3번째 점)",
  },
  {
    id: "fibonacci",
    label: "피보나치",
    clicks: 2,
    hint: "고점 ↔ 저점",
    featureId: "draw.fib.retracement",
  },
  {
    id: "rectangle",
    label: "사각형",
    clicks: 2,
    hint: "모서리 2점",
    featureId: "draw.rectangle",
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
  return DRAWING_TOOL_META.find((t) => t.id === tool)?.clicks ?? 1;
}

export function defaultColor(tool: DrawingKind): string {
  switch (tool) {
    case "trend":
      return "#38bdf8";
    case "ray":
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
      return "#c084fc";
    case "rectangle":
      return "#fb7185";
    case "measure":
      return "#a3e635";
    case "text":
      return "#e8b86d";
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
  if (d.points.length < clicksRequired(d.tool)) return false;
  if (d.tool === "text" && !d.text?.trim()) return false;
  return true;
}
