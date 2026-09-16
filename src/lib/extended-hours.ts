import type { Candle, Timeframe } from "@/lib/types";
import { secondsPerBar } from "@/lib/market-data/types";

export type SessionBarTag = "pre" | "regular" | "post";

export type SessionTaggedCandle = Candle & { sessionTag?: SessionBarTag };

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** Append mock pre/post session bars when extended hours is enabled. */
export function appendExtendedSessionBars(
  candles: Candle[],
  timeframe: Timeframe,
  preCount = 4,
  postCount = 4
): SessionTaggedCandle[] {
  if (!candles.length) return [];
  const step = secondsPerBar(timeframe === "tick" ? "1" : timeframe);
  const tagged: SessionTaggedCandle[] = candles.map((c) => ({
    ...c,
    sessionTag: "regular" as SessionBarTag,
  }));

  const last = candles[candles.length - 1];
  const pre: SessionTaggedCandle[] = [];
  for (let i = preCount; i >= 1; i--) {
    const t = last.time - step * i;
    const base = last.open * (1 - 0.001 * i);
    pre.push({
      time: t,
      open: round(base),
      high: round(base * 1.002),
      low: round(base * 0.998),
      close: round(base * (1 + (i % 2 ? 0.0005 : -0.0003))),
      volume: Math.floor(last.volume * 0.15),
      sessionTag: "pre",
    });
  }

  const post: SessionTaggedCandle[] = [];
  for (let i = 1; i <= postCount; i++) {
    const t = last.time + step * i;
    const base = last.close * (1 + 0.0008 * i);
    post.push({
      time: t,
      open: round(base),
      high: round(base * 1.003),
      low: round(base * 0.997),
      close: round(base * (1 + (i % 2 ? -0.0004 : 0.0006))),
      volume: Math.floor(last.volume * 0.12),
      sessionTag: "post",
    });
  }

  const core = tagged.slice(0, -1);
  const lastTagged = { ...last, sessionTag: "regular" as SessionBarTag };
  return [...core, ...pre, lastTagged, ...post];
}
