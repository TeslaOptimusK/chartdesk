import type { Candle } from "@/lib/types";

/** JS custom indicator sandbox — candles only in scope */
export function runCustomIndicator(
  source: string,
  candles: Candle[]
): (number | null)[] {
  const trimmed = source.trim();
  if (!trimmed) return candles.map(() => null);
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    "candles",
    `"use strict";
    const result = (function() { ${trimmed} })();
    if (!Array.isArray(result)) return null;
    return result;`
  ) as (candles: Candle[]) => unknown;
  try {
    const raw = fn(candles);
    if (!Array.isArray(raw)) return candles.map(() => null);
    return candles.map((_, i) => {
      const v = raw[i];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    });
  } catch {
    return candles.map(() => null);
  }
}

export const CUSTOM_INDICATOR_EXAMPLE = `// return array same length as candles
return candles.map((c, i) => {
  if (i < 5) return null;
  let s = 0;
  for (let j = i - 4; j <= i; j++) s += candles[j].close;
  return s / 5;
});`;
