"use client";

import { useEffect, useMemo } from "react";
import { useWorkspace } from "@/lib/store";
import { useQuotesStore } from "@/lib/quotes-store";
import type { SessionQuoteView } from "@/lib/session-quote";

/** Polls the previous close and pre-market price for every watchlist symbol. */
export function SessionQuoteBridge() {
  const symbols = useWorkspace((s) => s.symbols);
  const ready = useWorkspace((s) => s.ready);
  const setSessionQuote = useQuotesStore((s) => s.setSessionQuote);
  const idsKey = useMemo(() => symbols.map((s) => s.id).sort().join(","), [symbols]);

  useEffect(() => {
    if (!ready || !idsKey) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/market/session-quote?ids=${encodeURIComponent(idsKey)}`
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { quotes?: Record<string, SessionQuoteView> };
        if (!data.quotes) return;
        for (const [id, quote] of Object.entries(data.quotes)) {
          if (!cancelled) setSessionQuote(id, quote);
        }
      } catch {
        /* keep the last session quote */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, idsKey, setSessionQuote]);

  return null;
}
