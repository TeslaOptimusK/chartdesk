import type { Candle, PatternDef, PatternHit, SymbolMeta, Timeframe } from "@/lib/types";
import { ema, findSwingHighs, findSwingLows, rsi, sma } from "@/lib/indicators";

function num(params: PatternDef["rules"][0]["params"], key: string, fallback: number) {
  const v = params?.[key];
  return typeof v === "number" ? v : fallback;
}

export function matchPattern(
  pattern: PatternDef,
  symbol: SymbolMeta,
  timeframe: Timeframe,
  candles: Candle[]
): PatternHit | null {
  if (!pattern.enabled) return null;
  if (pattern.timeframes.length && !pattern.timeframes.includes(timeframe)) {
    return null;
  }
  if (candles.length < 30) return null;

  let score = 0;
  let fromIdx = Math.max(0, candles.length - 40);
  let toIdx = candles.length - 1;

  for (const rule of pattern.rules) {
    const closes = candles.map((c) => c.close);
    switch (rule.type) {
      case "ma_cross": {
        const fast = num(rule.params, "fast", 9);
        const slow = num(rule.params, "slow", 21);
        const f = ema(closes, fast);
        const s = ema(closes, slow);
        const i = candles.length - 1;
        const prev = i - 1;
        if (
          f[prev] != null &&
          s[prev] != null &&
          f[i] != null &&
          s[i] != null &&
          f[prev]! <= s[prev]! &&
          f[i]! > s[i]!
        ) {
          score += 0.55;
          fromIdx = Math.max(0, i - slow);
        }
        break;
      }
      case "swing_low_pair": {
        const tol = num(rule.params, "tolerancePct", 1.5) / 100;
        const lows = findSwingLows(candles);
        if (lows.length >= 2) {
          const a = lows[lows.length - 2];
          const b = lows[lows.length - 1];
          const pa = candles[a].low;
          const pb = candles[b].low;
          if (Math.abs(pa - pb) / pa <= tol) {
            score += 0.5;
            fromIdx = a;
            toIdx = b;
          }
        }
        break;
      }
      case "support_bounce": {
        const lows = findSwingLows(candles);
        if (lows.length >= 1) {
          const last = lows[lows.length - 1];
          const support = candles[last].low;
          const recent = candles[candles.length - 1];
          if (
            recent.low <= support * 1.01 &&
            recent.close > support &&
            recent.close > recent.open
          ) {
            score += 0.45;
            fromIdx = last;
          }
        }
        break;
      }
      case "rsi_oversold": {
        const period = num(rule.params, "period", 14);
        const threshold = num(rule.params, "threshold", 30);
        const values = rsi(candles, period);
        const last = values[values.length - 1];
        if (last != null && last < threshold) {
          score += 0.4;
          fromIdx = Math.max(0, candles.length - period);
        }
        break;
      }
      case "bullish_engulfing": {
        const i = candles.length - 1;
        const prev = candles[i - 1];
        const cur = candles[i];
        if (
          prev.close < prev.open &&
          cur.close > cur.open &&
          cur.open <= prev.close &&
          cur.close >= prev.open
        ) {
          score += 0.5;
          fromIdx = i - 1;
          toIdx = i;
        }
        break;
      }
      case "neckline_break": {
        const highs = findSwingHighs(candles);
        if (highs.length >= 1) {
          const neck = candles[highs[highs.length - 1]].high;
          const last = candles[candles.length - 1];
          if (last.close > neck && last.close > last.open) {
            score += 0.45;
            fromIdx = highs[highs.length - 1];
          }
        }
        break;
      }
      case "volume_spike": {
        const avg = sma(
          candles.map((c) => c.volume),
          20
        );
        const i = candles.length - 1;
        const mult = num(rule.params, "mult", 2);
        if (avg[i] != null && candles[i].volume > avg[i]! * mult) {
          score += 0.35;
          fromIdx = Math.max(0, i - 5);
        }
        break;
      }
    }
  }

  const needed = Math.max(0.4, pattern.rules.length * 0.35);
  if (score < needed) return null;

  return {
    id: `hit_${pattern.id}_${symbol.id}_${timeframe}_${candles[toIdx].time}`,
    patternId: pattern.id,
    symbolId: symbol.id,
    timeframe,
    fromTs: candles[fromIdx].time,
    toTs: candles[toIdx].time,
    score: Math.min(1, score),
    label: pattern.display.label,
    createdAt: new Date().toISOString(),
  };
}

export function matchAllPatterns(
  patterns: PatternDef[],
  symbol: SymbolMeta,
  timeframe: Timeframe,
  candles: Candle[]
): PatternHit[] {
  return patterns
    .map((p) => matchPattern(p, symbol, timeframe, candles))
    .filter((h): h is PatternHit => h != null);
}

/** Minimal pattern DSL: `RULE key=value key=value; RULE ...` */
export function parsePatternDsl(dsl: string): PatternDef["rules"] {
  const rules: PatternDef["rules"] = [];
  const parts = dsl
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    const [typeToken, ...rest] = part.split(/\s+/);
    const type = typeToken.toLowerCase() as PatternDef["rules"][0]["type"];
    const params: Record<string, number | string | boolean> = {};
    for (const token of rest) {
      const [k, v] = token.split("=");
      if (!k || v == null) continue;
      if (v === "true" || v === "false") params[k] = v === "true";
      else if (!Number.isNaN(Number(v))) params[k] = Number(v);
      else params[k] = v;
    }
    rules.push({ type, params });
  }
  return rules;
}
