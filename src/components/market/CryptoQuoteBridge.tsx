"use client";

import { useEffect, useMemo } from "react";
import { cryptoVenue } from "@/lib/crypto-venue";
import { useQuotesStore } from "@/lib/quotes-store";
import { useWorkspace } from "@/lib/store";

/** Polls each listed coin at its own exchange so Upbit and Binance prices stay apart. */
export function CryptoQuoteBridge() {
  const symbols = useWorkspace((s) => s.symbols);
  const ready = useWorkspace((s) => s.ready);
  const setVenueQuote = useQuotesStore((s) => s.setVenueQuote);
  const idsKey = useMemo(
    () =>
      symbols
        .filter((symbol) => symbol.assetClass === "crypto" && cryptoVenue(symbol.exchange))
        .map((symbol) => symbol.id)
        .sort()
        .join(","),
    [symbols]
  );

  useEffect(() => {
    if (!ready || !idsKey) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/market/crypto-quotes?ids=${encodeURIComponent(idsKey)}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          quotes?: Record<string, { price: number; changePct: number; ccy: "KRW" | "USDT" }>;
        };
        for (const [id, quote] of Object.entries(data.quotes ?? {})) {
          if (!cancelled) setVenueQuote(id, quote);
        }
      } catch {
        /* keep the last venue print */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, idsKey, setVenueQuote]);

  return null;
}
