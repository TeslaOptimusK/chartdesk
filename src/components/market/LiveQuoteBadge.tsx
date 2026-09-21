"use client";

import { cn } from "@/lib/utils";
import {
  formatChangePct,
  formatQuotePrice,
  useQuotesStore,
  type LiveQuote,
} from "@/lib/quotes-store";

export function LiveQuoteBadge({
  symbolId,
  className,
  compact = false,
}: {
  symbolId: string;
  className?: string;
  /** Watchlist row: stack price / pct */
  compact?: boolean;
}) {
  const quote = useQuotesStore((s) => s.quotes[symbolId] as LiveQuote | undefined);
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
    </span>
  );
}
