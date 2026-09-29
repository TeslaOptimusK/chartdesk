"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatChangePct,
  formatQuotePrice,
  useQuotesStore,
  type LiveQuote,
} from "@/lib/quotes-store";
import type { AssetClass } from "@/lib/types";

function clockParts(now: Date, timeZone: string): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday, minutes: hour * 60 + minute };
}

function sessionOpen(assetClass: AssetClass | undefined, now: Date): boolean {
  if (assetClass === "us_stock") {
    const { weekday, minutes } = clockParts(now, "America/New_York");
    if (weekday === "Sat" || weekday === "Sun") return false;
    return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
  }
  if (assetClass === "kr_stock") {
    const { weekday, minutes } = clockParts(now, "Asia/Seoul");
    if (weekday === "Sat" || weekday === "Sun") return false;
    return minutes >= 9 * 60 && minutes < 15 * 60 + 30;
  }
  return false;
}

function sessionLabel(
  assetClass: AssetClass | undefined,
  updatedAt: number | undefined,
  now: Date
): string {
  const open = sessionOpen(assetClass, now);
  const age = updatedAt == null ? Number.POSITIVE_INFINITY : now.getTime() - updatedAt;
  if (open && age < 4_000) return "실시간";
  if (open) return "시세 대기";
  return "장마감";
}

export function LiveQuoteBadge({
  symbolId,
  className,
  compact = false,
  assetClass,
}: {
  symbolId: string;
  className?: string;
  /** Watchlist row: stack price / pct */
  compact?: boolean;
  assetClass?: AssetClass;
}) {
  const quote = useQuotesStore((s) => s.quotes[symbolId] as LiveQuote | undefined);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const session = sessionLabel(assetClass, quote?.updatedAt, now);
  if (!quote) {
    return (
      <span
        className={cn(
          "font-mono text-[10px] text-[var(--workspace-faint)]",
          className
        )}
        data-feature="quote.pending"
      >
        —
      </span>
    );
  }

  const up = quote.changePct >= 0;
  const color = up ? "text-emerald-300" : "text-rose-300";

  if (compact) {
    return (
      <div
        className={cn("text-right font-mono leading-tight", className)}
        data-feature="quote.live"
        data-symbol={symbolId}
      >
        <div className={cn("text-sm font-medium", color)}>
          {formatQuotePrice(quote.last)}
        </div>
        <div className={cn("text-[10px]", color)}>
          {formatChangePct(quote.changePct)}
          <span className="ml-1 text-[var(--workspace-faint)]">{session}</span>
        </div>
      </div>
    );
  }

  return (
    <span
      className={cn("inline-flex items-baseline gap-1.5 font-mono", className)}
      data-feature="quote.live"
      data-symbol={symbolId}
    >
      <span className={cn("text-sm font-semibold", color)}>
        {formatQuotePrice(quote.last)}
      </span>
      <span className={cn("text-xs", color)}>
        {formatChangePct(quote.changePct)}
      </span>
      <span className="text-[10px] text-[var(--workspace-faint)]">{session}</span>
    </span>
  );
}
