/** Canvas cannot resolve CSS variables, and IBM Plex (latin-only) has no Hangul. */
export const CHART_LABEL_FAMILY = '"Segoe UI", "Malgun Gothic", sans-serif';

export function chartLabelFont(px: number, weight: 500 | 600 = 600): string {
  return `${weight} ${px}px ${CHART_LABEL_FAMILY}`;
}

export function formatLinePrice(n: number): string {
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (abs >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}

/** Solid tag anchored to `right`, centered on `y`. Sits on the price scale like a TradingView axis chip. */
export function fillRightPriceTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  right: number,
  y: number,
  bg: string,
  fg: string,
  px = 12
): void {
  ctx.save();
  ctx.font = chartLabelFont(px, 600);
  const padX = 6;
  const h = 18;
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const left = right - w;
  const top = Math.round(y - h / 2);
  ctx.fillStyle = bg;
  ctx.beginPath();
  const r = 3;
  ctx.moveTo(left + r, top);
  ctx.arcTo(left + w, top, left + w, top + h, r);
  ctx.arcTo(left + w, top + h, left, top + h, r);
  ctx.arcTo(left, top + h, left, top, r);
  ctx.arcTo(left, top, left + w, top, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + padX, top + h / 2);
  ctx.restore();
}

/** Dark stroke then fill, in the canvas's current (CSS-pixel) space. */
export function fillChartLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  px = 12
): void {
  ctx.save();
  ctx.font = chartLabelFont(px);
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "rgba(5, 8, 12, 0.94)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}
