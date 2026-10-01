"use client";

import { cn } from "@/lib/utils";

const MARK: Record<string, { bg: string; fg: string; label: string }> = {
  UPBIT: { bg: "#093687", fg: "#ffffff", label: "U" },
  BITHUMB: { bg: "#e11d2e", fg: "#ffffff", label: "B" },
  BINANCE: { bg: "#f0b90b", fg: "#1e2329", label: "◆" },
  BYBIT: { bg: "#f7a600", fg: "#121212", label: "Y" },
  NASDAQ: { bg: "#0090d0", fg: "#ffffff", label: "N" },
  NYSE: { bg: "#1b4f9c", fg: "#ffffff", label: "NY" },
  AMEX: { bg: "#0f766e", fg: "#ffffff", label: "A" },
  KOSPI: { bg: "#1d4ed8", fg: "#ffffff", label: "KS" },
  KOSDAQ: { bg: "#7c3aed", fg: "#ffffff", label: "KQ" },
  KONEX: { bg: "#475569", fg: "#ffffff", label: "KX" },
  KRX: { bg: "#1d4ed8", fg: "#ffffff", label: "K" },
};

/** Small exchange mark, the same job as the logo on a TradingView symbol row. */
export function ExchangeMark({
  exchange,
  className,
}: {
  exchange: string;
  className?: string;
}) {
  const key = exchange.trim().toUpperCase();
  const mark = MARK[key] ?? {
    bg: "#334155",
    fg: "#f8fafc",
    label: key.slice(0, 2) || "?",
  };
  return (
    <span
      title={key}
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[3px] px-0.5 text-[8px] font-bold leading-none",
        className
      )}
      style={{ background: mark.bg, color: mark.fg }}
      data-exchange={key}
    >
      {mark.label}
    </span>
  );
}
