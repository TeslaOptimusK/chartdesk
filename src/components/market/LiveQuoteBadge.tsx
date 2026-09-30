"use client";

import { cn } from "@/lib/utils";
import {
  formatChangePct,
  formatQuotePrice,
  useQuotesStore,
  type LiveQuote,
} from "@/lib/quotes-store";
import type { SessionQuoteView } from "@/lib/session-quote";
import type { AssetClass } from "@/lib/types";

function kindLabel(session: SessionQuoteView | null | undefined): string {
  if (!session || session.phase === "always") return "";
  if (session.priceKind === "live") return "현재가";
  return "종가";
}

function preChange(session: SessionQuoteView): number | null {
  if (session.preLine == null || session.closeLine == null || session.closeLine === 0) return null;
  return ((session.preLine - session.closeLine) / session.closeLine) * 100;
}

export function LiveQuoteBadge({
  symbolId,
  className,
  compact = false,
}: {
  symbolId: string;
  className?: string;
  /** Watchlist row: stack price / pct */
  compact?: boolean;
  assetClass?: AssetClass;
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
  const label = kindLabel(quote.session);
  const prePct = quote.session ? preChange(quote.session) : null;

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
          {label && <span className="ml-1 text-[var(--workspace-faint)]">{label}</span>}
        </div>
        {quote.session?.preLine != null && prePct != null && (
          <div className={cn("text-[10px]", prePct >= 0 ? "text-emerald-300" : "text-rose-300")}>
            프리 {formatQuotePrice(quote.session.preLine)} {formatChangePct(prePct)}
          </div>
        )}
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
      {label && <span className="text-[10px] text-[var(--workspace-faint)]">{label}</span>}
      {quote.session?.preLine != null && prePct != null && (
        <span className={cn("text-[10px]", prePct >= 0 ? "text-emerald-300" : "text-rose-300")}>
          프리 {formatQuotePrice(quote.session.preLine)} {formatChangePct(prePct)}
        </span>
      )}
    </span>
  );
}
