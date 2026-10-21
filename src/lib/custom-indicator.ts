import type { Candle } from "@/lib/types";

function compileIndicator(source: string): (candles: Candle[]) => unknown {
  return new Function(
    "candles",
    `"use strict";
    const result = (function() { ${source} })();
    if (!Array.isArray(result)) return null;
    return result;`
  ) as (candles: Candle[]) => unknown;
}

/** Null when the script compiles, otherwise the syntax error to show the user. */
export function customIndicatorError(source: string): string | null {
  const trimmed = source.trim();
  if (!trimmed) return null;
  try {
    compileIndicator(trimmed);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** JS custom indicator sandbox — candles only in scope */
export function runCustomIndicator(
  source: string,
  candles: Candle[]
): (number | null)[] {
  const trimmed = source.trim();
  if (!trimmed) return candles.map(() => null);
  try {
    const raw = compileIndicator(trimmed)(candles);
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
