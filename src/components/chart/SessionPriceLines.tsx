"use client";

import { useEffect } from "react";
import { LineStyle, type IPriceLine, type ISeriesApi } from "lightweight-charts";
import type { ChartApiBundle } from "@/components/chart/DrawingOverlay";
import { useQuotesStore } from "@/lib/quotes-store";

/**
 * Previous-close line, plus a separate pre-market line before the open.
 */
export function SessionPriceLines({
  chartApi,
  symbolId,
}: {
  chartApi: ChartApiBundle | null;
  symbolId: string;
}) {
  const session = useQuotesStore((s) => s.quotes[symbolId]?.session ?? null);

  useEffect(() => {
    const series = chartApi?.series as ISeriesApi<"Candlestick"> | undefined;
    if (!series || !session) return;
    const lines: IPriceLine[] = [];
    if (session.closeLine != null) {
      lines.push(
        series.createPriceLine({
          price: session.closeLine,
          color: "#e2e8f0",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "종가",
        })
      );
    }
    if (session.phase === "pre" && session.preLine != null) {
      lines.push(
        series.createPriceLine({
          price: session.preLine,
          color: "#fb923c",
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "프리",
        })
      );
    }
    return () => {
      for (const line of lines) {
        try {
          series.removePriceLine(line);
        } catch {
          /* series already replaced */
        }
      }
    };
  }, [chartApi, session, symbolId]);

  return null;
}
