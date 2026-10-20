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

/** Keep every tag on its own row. Close prices step away instead of painting on each other. */
export function placeTagYs(ys: number[], height: number, band = 20): number[] {
  const order = ys
    .map((y, index) => ({ y, index }))
    .sort((a, b) => a.y - b.y || a.index - b.index);
  const placed: number[] = [];
  const out = new Array<number>(ys.length);
  const minY = 12;
  const maxY = Math.max(minY, height - 12);
  for (const item of order) {
    const taken = (yy: number) => placed.some((py) => Math.abs(py - yy) < band);
    let y = Math.max(minY, Math.min(maxY, item.y));
    if (taken(y)) {
      let found = false;
      for (let step = 1; step < 48; step++) {
        const down = item.y + step * band;
        const up = item.y - step * band;
        if (down <= maxY && !taken(down)) {
          y = down;
          found = true;
          break;
        }
        if (up >= minY && !taken(up)) {
          y = up;
          found = true;
          break;
        }
      }
      if (!found) {
        y = minY;
        while (taken(y) && y + band <= maxY) y += band;
      }
    }
    placed.push(y);
    out[item.index] = y;
  }
  return out;
}

/** Solid tag anchored to `right`, centered on `y`. Returns the tag's left edge. */
export function fillRightPriceTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  right: number,
  y: number,
  bg: string,
  fg: string,
  px = 12
): number {
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
  return left;
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
