"use client";

import { useEffect, useMemo } from "react";
import { useWorkspace } from "@/lib/store";
import { subscribeQuoteStream } from "@/lib/market-stream";
import { isChartQuoteOwner, useQuotesStore } from "@/lib/quotes-store";

/**
 * Keeps the shared quote store warm for all workspace symbols over the shared market stream.
 * Chart panes also write into the same store so header + watchlist stay in sync.
 */
export function LiveQuotesBridge() {
  const symbols = useWorkspace((s) => s.symbols);
  const watchlist = useWorkspace((s) => s.watchlist);
  const ready = useWorkspace((s) => s.ready);
  const timeframe = useWorkspace((s) => s.timeframe);
  const setFromTick = useQuotesStore((s) => s.setFromTick);
  const setFromCandles = useQuotesStore((s) => s.setFromCandles);

  // Watchlist first: the server caps how many quotes one stream carries.
  const idsKey = useMemo(() => {
    const listed = new Set(watchlist);
    const rest = symbols
      .map((s) => s.id)
      .filter((id) => !listed.has(id))
      .sort();
    return [...watchlist, ...rest].join(",");
  }, [symbols, watchlist]);

  useEffect(() => {
    if (!ready || !idsKey) return;
    const ids = idsKey.split(",").filter(Boolean);
    if (!ids.length) return;

    return subscribeQuoteStream(ids, timeframe, (msg) => {
      // A visible chart pane is the only quote source for that symbol.
      if (isChartQuoteOwner(msg.symbolId)) return;

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
    });
  }, [ready, idsKey, timeframe, setFromTick, setFromCandles]);

  return null;
}
