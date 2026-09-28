/** Canvas cannot resolve CSS variables, and IBM Plex (latin-only) has no Hangul. */
export const CHART_LABEL_FAMILY = '"Segoe UI", "Malgun Gothic", sans-serif';

export function chartLabelFont(px: number, weight: 500 | 600 = 600): string {
  return `${weight} ${px}px ${CHART_LABEL_FAMILY}`;
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
