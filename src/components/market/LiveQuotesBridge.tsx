"use client";

import { useEffect, useMemo } from "react";
import { useWorkspace } from "@/lib/store";
import { useQuotesStore } from "@/lib/quotes-store";
import type { Candle } from "@/lib/types";

/**
 * Keeps the shared quote store warm for all workspace symbols via multiplexed SSE.
 * Chart panes also write into the same store so header + watchlist stay in sync.
 */
export function LiveQuotesBridge() {
  const symbols = useWorkspace((s) => s.symbols);
  const ready = useWorkspace((s) => s.ready);
  const setFromTick = useQuotesStore((s) => s.setFromTick);
  const setFromCandles = useQuotesStore((s) => s.setFromCandles);

  const idsKey = useMemo(
    () => symbols.map((s) => s.id).sort().join(","),
    [symbols]
  );

  useEffect(() => {
    if (!ready || !idsKey) return;
    const ids = idsKey.split(",").filter(Boolean);
    if (!ids.length) return;

    let cancelled = false;
    const es = new EventSource(
      `/api/market/quotes-sse?ids=${encodeURIComponent(idsKey)}&tf=1`
    );

    es.onmessage = (ev) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(ev.data) as {
          type?: string;
          symbolId?: string;
          candle?: Candle;
          prevClose?: number;
          barRoll?: boolean;
        };
        if (msg.type !== "quote" || !msg.symbolId || !msg.candle) return;

        // Prefer tick path so forming-bar updates animate; seed first quote
        // may arrive before any prior store entry.
        const existing = useQuotesStore.getState().quotes[msg.symbolId];
        if (!existing && msg.prevClose != null) {
          setFromCandles(msg.symbolId, [
            {
              time: msg.candle.time - 60,
              open: msg.prevClose,
              high: msg.prevClose,
              low: msg.prevClose,
              close: msg.prevClose,
              volume: 0,
            },
            msg.candle,
          ]);
        } else {
          setFromTick(msg.symbolId, msg.candle);
        }
      } catch {
        /* ignore */
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [ready, idsKey, setFromTick, setFromCandles]);

  return null;
}
