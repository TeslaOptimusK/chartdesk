import type { AssetClass } from "@/lib/types";

/** How the quote number is chosen. `close` is the official session close. */
export type QuotePhase = "pre" | "regular" | "after" | "closed" | "always";
export type QuotePriceKind = "close" | "live";

export interface SessionQuoteView {
  phase: QuotePhase;
  /** Number in the header and watchlist. */
  displayPrice: number;
  /** Previous session close used as the percent base. */
  changeBase: number;
  changePct: number;
  /** Horizontal line for the official close, or the prior close once the session is open. */
  closeLine: number | null;
  /** Pre-market last. Drawn only before the open. */
  preLine: number | null;
  priceKind: QuotePriceKind;
}

function pct(price: number, base: number): number {
  if (!base) return 0;
  return ((price - base) / base) * 100;
}

function clock(now: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { day: dayMap[weekday] ?? 1, minutes: (hour === 24 ? 0 : hour) * 60 + minute };
}

export function clockQuotePhase(
  assetClass: AssetClass | undefined,
  exchange: string | undefined,
  now = new Date()
): QuotePhase {
  const ex = (exchange ?? "").toUpperCase();
  if (assetClass === "crypto" || ex.includes("BINANCE") || ex.includes("CRYPTO")) {
    return "always";
  }
  const kr =
    assetClass === "kr_stock" || ex === "KRX" || ex === "KOSPI" || ex === "KOSDAQ";
  if (kr) {
    const { day, minutes } = clock(now, "Asia/Seoul");
    if (day === 0 || day === 6) return "closed";
    if (minutes >= 8 * 60 && minutes < 9 * 60) return "pre";
    if (minutes >= 9 * 60 && minutes < 15 * 60 + 30) return "regular";
    return "closed";
  }
  const { day, minutes } = clock(now, "America/New_York");
  if (day === 0 || day === 6) return "closed";
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "pre";
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "regular";
  if (minutes >= 16 * 60 && minutes < 20 * 60) return "after";
  return "closed";
}

/** Yahoo `marketState` wins when it names a session. A holiday CLOSE beats the clock. */
export function mergeQuotePhase(clockPhase: QuotePhase, marketState: string | null): QuotePhase {
  if (clockPhase === "always") return "always";
  const state = (marketState ?? "").toUpperCase();
  if (state === "REGULAR") return "regular";
  if (state === "PRE" || state === "PREPRE") return "pre";
  if (state === "POST") return "after";
  if (state === "CLOSED" || state === "POSTPOST") return "closed";
  return clockPhase;
}

export function sessionDayKey(timeSec: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timeSec * 1000));
}

export function barIsToday(timeSec: number, now: Date, timeZone: string): boolean {
  const today = sessionDayKey(Math.floor(now.getTime() / 1000), timeZone);
  const zoned = sessionDayKey(timeSec, timeZone);
  const utc = new Date(timeSec * 1000).toISOString().slice(0, 10);
  return zoned === today || utc === today;
}

/**
 * TradingView-style quote.
 * Closed and pre-market show the official close versus the close before it.
 * The regular session shows the live price versus that prior close.
 * Pre-market also keeps a separate pre line.
 */
export function resolveSessionQuote(input: {
  phase: QuotePhase;
  /** Regular-session daily closes, oldest first. */
  dailyCloses: number[];
  lastBarIsToday: boolean;
  livePrice: number | null;
  prePrice: number | null;
}): SessionQuoteView | null {
  const closes = input.dailyCloses.filter((n) => Number.isFinite(n) && n > 0);
  if (closes.length < 2) return null;
  const last = closes[closes.length - 1]!;
  const prev = closes[closes.length - 2]!;
  const older = closes.length > 2 ? closes[closes.length - 3]! : prev;
  const live = input.livePrice != null && input.livePrice > 0 ? input.livePrice : null;

  if (input.phase === "regular" || input.phase === "always") {
    const base = input.lastBarIsToday ? prev : last;
    const price = live ?? last;
    return {
      phase: input.phase,
      displayPrice: price,
      changeBase: base,
      changePct: pct(price, base),
      closeLine: base,
      preLine: null,
      priceKind: "live",
    };
  }

  if (input.phase === "pre") {
    const official = input.lastBarIsToday ? prev : last;
    const base = input.lastBarIsToday ? older : prev;
    const pre =
      input.prePrice != null &&
      input.prePrice > 0 &&
      Math.abs(input.prePrice - official) / official > 0.00005
        ? input.prePrice
        : null;
    return {
      phase: "pre",
      displayPrice: official,
      changeBase: base,
      changePct: pct(official, base),
      closeLine: official,
      preLine: pre,
      priceKind: "close",
    };
  }

  return {
    phase: input.phase,
    displayPrice: last,
    changeBase: prev,
    changePct: pct(last, prev),
    closeLine: last,
    preLine: null,
    priceKind: "close",
  };
}
