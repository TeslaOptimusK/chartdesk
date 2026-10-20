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

function formatVenuePrice(n: number, ccy?: string): string {
  if (ccy === "KRW") return Math.round(n).toLocaleString("ko-KR");
  if (ccy === "USDT") {
    if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(2);
    return n.toPrecision(4);
  }
  return formatQuotePrice(n);
}

function extChange(price: number | null, closeLine: number | null): number | null {
  if (price == null || closeLine == null || closeLine === 0) return null;
  return ((price - closeLine) / closeLine) * 100;
}

function ExtendedPrice({
  label,
  price,
  change,
  ccy,
}: {
  label: string;
  price: number;
  change: number;
  ccy?: string;
}) {
  const up = change >= 0;
  return (
    <div className={cn("whitespace-nowrap text-[10px]", up ? "text-emerald-300" : "text-rose-300")}>
      <span className="text-[var(--workspace-faint)]">{label} </span>
      {formatVenuePrice(price, ccy)} {formatChangePct(change)}
    </div>
  );
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
          "inline-block min-w-[6.5rem] text-right font-mono text-sm tabular-nums text-[var(--workspace-faint)]",
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
  const prePct = quote.session ? extChange(quote.session.preLine, quote.session.closeLine) : null;
  const postPct = quote.session ? extChange(quote.session.postLine, quote.session.closeLine) : null;
  const extended = (
    <>
      {quote.session?.preLine != null && prePct != null && (
        <ExtendedPrice label="장전" price={quote.session.preLine} change={prePct} ccy={quote.quoteCcy} />
      )}
      {quote.session?.postLine != null && postPct != null && (
        <ExtendedPrice label="장후" price={quote.session.postLine} change={postPct} ccy={quote.quoteCcy} />
      )}
    </>
  );

  if (compact) {
    return (
      <div
        className={cn("shrink-0 text-right font-mono tabular-nums leading-tight", className)}
        data-feature="quote.live"
        data-symbol={symbolId}
      >
        <div className={cn("text-sm font-medium", color)}>
          {formatVenuePrice(quote.last, quote.quoteCcy)}
        </div>
        <div className={cn("text-[10px]", color)}>
          {formatChangePct(quote.changePct)}
          {label && <span className="ml-1 text-[var(--workspace-faint)]">{label}</span>}
        </div>
        {extended}
      </div>
    );
  }

  return (
    <span
      className={cn("inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap font-mono tabular-nums", className)}
      data-feature="quote.live"
      data-symbol={symbolId}
    >
      <span className={cn("text-sm font-semibold", color)}>
        {formatVenuePrice(quote.last, quote.quoteCcy)}
      </span>
      <span className={cn("text-xs", color)}>
        {formatChangePct(quote.changePct)}
      </span>
      {label && <span className="text-[10px] text-[var(--workspace-faint)]">{label}</span>}
      {extended}
    </span>
  );
}
