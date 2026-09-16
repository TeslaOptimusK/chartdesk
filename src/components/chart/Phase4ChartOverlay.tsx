"use client";

import { useEffect, useRef } from "react";
import type { ChartStyle } from "@/lib/types";
import {
  mockFootprintBars,
  mockTpoProfile,
  type FootprintBar,
} from "@/lib/chart-transforms";
import type { Candle } from "@/lib/types";

interface Phase4ChartOverlayProps {
  chartStyle: ChartStyle;
  candles: Candle[];
}

export function Phase4ChartOverlay({
  chartStyle,
  candles,
}: Phase4ChartOverlayProps) {
  if (chartStyle !== "volume_footprint" && chartStyle !== "tpo") return null;

  if (chartStyle === "volume_footprint") {
    const bars = mockFootprintBars(candles.slice(-24));
    return (
      <FootprintPane
        bars={bars}
        feature="chart.type.volume_footprint"
      />
    );
  }

  const profile = mockTpoProfile(candles.slice(-40));
  return <TpoPane profile={profile} feature="chart.type.tpo" />;
}

function FootprintPane({
  bars,
  feature,
}: {
  bars: FootprintBar[];
  feature: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bars.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = 4;
    const barW = (w - pad * 2) / bars.length;
    const allLevels = bars.flatMap((b) => b.levels);
    const minP = Math.min(...allLevels.map((l) => l.price));
    const maxP = Math.max(...allLevels.map((l) => l.price));
    const span = maxP - minP || 1;

    ctx.font = "9px ui-monospace, monospace";
    bars.forEach((bar, bi) => {
      const x0 = pad + bi * barW;
      bar.levels.forEach((lv) => {
        const y =
          pad + ((maxP - lv.price) / span) * (h - pad * 2 - 14);
        const total = lv.bidVol + lv.askVol;
        const askW = (lv.askVol / total) * (barW - 2);
        const bidW = barW - 2 - askW;
        const delta = lv.askVol - lv.bidVol;
        const deltaTint =
          delta > 0
            ? "rgba(56,189,248,0.75)"
            : delta < 0
              ? "rgba(239,83,80,0.75)"
              : "rgba(148,163,184,0.55)";
        ctx.fillStyle = deltaTint;
        ctx.fillRect(x0, y, barW - 2, 8);
        ctx.fillStyle = "rgba(56,189,248,0.45)";
        ctx.fillRect(x0, y, askW, 8);
        ctx.fillStyle = "rgba(239,83,80,0.45)";
        ctx.fillRect(x0 + askW, y, bidW, 8);
        ctx.fillStyle = "rgba(226,232,240,0.85)";
        ctx.fillText(
          delta >= 0 ? `+${delta}` : `${delta}`,
          x0 + 1,
          y + 7
        );
      });
    });

    ctx.fillStyle = "rgba(154,167,181,0.9)";
    ctx.fillText("mock FP · bid/ask vol", pad, h - 4);
  }, [bars]);

  return (
    <div
      className="pointer-events-none absolute inset-y-8 right-12 z-[12] w-[28%] min-w-[80px] rounded border border-[var(--workspace-border)]/60 bg-black/45"
      data-feature={feature}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

function TpoPane({
  profile,
  feature,
}: {
  profile: { price: number; letters: string }[];
  feature: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-y-8 right-12 z-[12] flex w-[22%] min-w-[72px] flex-col overflow-hidden rounded border border-[var(--workspace-border)]/60 bg-black/50 font-mono text-[9px] leading-tight text-[var(--workspace-muted)]"
      data-feature={feature}
    >
      <div className="border-b border-[var(--workspace-border)]/50 px-1 py-0.5 text-[8px] text-amber-200/80">
        mock TPO · letters
      </div>
      <div className="flex-1 overflow-hidden px-1 py-0.5">
        {profile.slice(0, 28).map((row) => (
          <div key={row.price} className="flex justify-between gap-1">
            <span className="text-[var(--workspace-fg)]">
              {row.price.toFixed(2)}
            </span>
            <span className="truncate text-sky-300/90">{row.letters}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
