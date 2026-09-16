"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartToolbar } from "@/components/workspace/ChartToolbar";
import { CommandPalette } from "@/components/workspace/CommandPalette";
import { Phase3Panels } from "@/components/workspace/Phase3Panels";
import { Phase4Panels } from "@/components/workspace/Phase4Panels";
import { IngestDialog } from "@/components/workspace/IngestDialog";
import { RightPanel } from "@/components/workspace/RightPanel";
import { SymbolChartPane } from "@/components/chart/SymbolChartPane";
import { MultiChartGrid } from "@/components/workspace/MultiChartGrid";
import { useWorkspace } from "@/lib/store";
import type { DrawingTool, Timeframe } from "@/lib/types";
import {
  TIMEZONE_OPTIONS,
  extendedSessionBadge,
  getSessionStatus,
  timezoneDisplay,
} from "@/lib/session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TF_KEYS: Record<string, Timeframe> = {
  "1": "1",
  "5": "5",
  "6": "15",
  "7": "60",
  "8": "240",
  "9": "D",
};

const TOOL_KEYS: Record<string, DrawingTool> = {
  t: "trend",
  r: "ray",
  h: "horizontal",
  y: "horizontal_ray",
  v: "vertical",
  c: "channel",
  b: "fibonacci",
  q: "rectangle",
  m: "measure",
  x: "text",
};

export function WorkspaceShell() {
  const {
    ready,
    hydrate,
    activeSymbolId,
    secondarySymbolIds,
    layoutMode,
    sync,
    activePaneIndex,
    setActivePaneIndex,
    paneTimeframes,
    timeframe,
    showDisclaimer,
    setShowDisclaimer,
    watchlist,
    fullscreen,
    setFullscreen,
    timezone,
    setTimezone,
    setTimeframe,
    setDrawingTool,
    setMagnet,
    magnet,
    setRightTab,
    drawingTool,
    symbols,
    undoDrawings,
    redoDrawings,
    setObjectTreeOpen,
    drawingsLocked,
    setDrawingsLocked,
    extendedHours,
    setPriceWatches,
    setTechnicalAlerts,
    setMultiConditionAlerts,
    setAlerts,
  } = useWorkspace();
  const [ingestOpen, setIngestOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    fetch("/api/bootstrap")
      .then(async (r) => {
        if (!r.ok) throw new Error("부트스트랩 실패");
        return r.json();
      })
      .then((data) => hydrate(data))
      .catch((e: Error) => setBootError(e.message));
  }, [hydrate]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Watchlist / multi / technical — evaluate pending across symbols on mock ticks
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      void fetch("/api/alerts/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "pending", tf: "D" }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.priceWatches) setPriceWatches(data.priceWatches);
          if (data.technicalAlerts) setTechnicalAlerts(data.technicalAlerts);
          if (data.multiConditionAlerts) {
            setMultiConditionAlerts(data.multiConditionAlerts);
          }
          if (data.fired?.length && data.alerts) setAlerts(data.alerts);
        })
        .catch(() => undefined);
    };
    tick();
    const id = window.setInterval(tick, 12_000);
    return () => window.clearInterval(id);
  }, [
    ready,
    setPriceWatches,
    setTechnicalAlerts,
    setMultiConditionAlerts,
    setAlerts,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redoDrawings();
        else undoDrawings();
        return;
      }

      if (e.key === "Escape") {
        if (fullscreen) {
          setFullscreen(false);
          return;
        }
        if (drawingTool !== "none") {
          setDrawingTool("none");
          return;
        }
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFullscreen(!fullscreen);
        return;
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setMagnet(!magnet);
        return;
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        setDrawingsLocked(!drawingsLocked);
        return;
      }

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setRightTab("alerts");
        return;
      }

      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setObjectTreeOpen(true);
        return;
      }

      if (TF_KEYS[e.key]) {
        e.preventDefault();
        setTimeframe(TF_KEYS[e.key]);
        return;
      }

      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) {
        e.preventDefault();
        setDrawingTool(drawingTool === tool ? "none" : tool);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    fullscreen,
    setFullscreen,
    drawingTool,
    setDrawingTool,
    magnet,
    setMagnet,
    setTimeframe,
    setRightTab,
    undoDrawings,
    redoDrawings,
    setObjectTreeOpen,
    drawingsLocked,
    setDrawingsLocked,
  ]);

  const active = symbols.find((s) => s.id === activeSymbolId);
  const session = useMemo(
    () => getSessionStatus(active?.exchange, clock),
    [active?.exchange, clock]
  );
  const extBadge = useMemo(
    () => extendedSessionBadge(active?.exchange, extendedHours, clock),
    [active?.exchange, extendedHours, clock]
  );

  const paneSymbolsRaw =
    layoutMode === "single"
      ? [activeSymbolId]
      : layoutMode === "split2"
        ? [
            activeSymbolId,
            secondarySymbolIds[0] ?? watchlist[1] ?? activeSymbolId,
          ]
        : [
            activeSymbolId,
            secondarySymbolIds[0] ?? watchlist[1] ?? activeSymbolId,
            secondarySymbolIds[1] ?? watchlist[2] ?? activeSymbolId,
            secondarySymbolIds[2] ?? watchlist[3] ?? activeSymbolId,
          ];
  const paneSymbols = sync.symbol
    ? paneSymbolsRaw.map(() => activeSymbolId)
    : paneSymbolsRaw;

  if (bootError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--workspace-bg)] text-rose-300">
        {bootError}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--workspace-bg)] text-[var(--workspace-muted)]">
        ChartDesk 로딩 중…
      </div>
    );
  }

  const tzNow = clock.toLocaleString("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={cn(
        "flex h-screen flex-col overflow-hidden bg-[var(--workspace-bg)] text-[var(--workspace-fg)]",
        fullscreen && "fixed inset-0 z-50"
      )}
      data-fullscreen={fullscreen ? "1" : "0"}
    >
      {showDisclaimer && !fullscreen && (
        <div className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
          <p className="flex-1 leading-relaxed">
            <strong className="font-semibold">면책:</strong> ChartDesk는
            학습·연구 보조 도구이며 투자 자문·권유가 아닙니다. 팬딩 멤버십
            원문은 본인 계정 권한으로만 열람·붙여넣기하세요. 유료 콘텐츠
            스크래핑·재배포는 지원하지 않습니다. TradingView 상표·위젯과
            무관한 자체 차트 워크스페이스입니다.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-amber-100"
            onClick={() => setShowDisclaimer(false)}
          >
            닫기
          </Button>
        </div>
      )}

      {!fullscreen && <ChartToolbar onOpenIngest={() => setIngestOpen(true)} />}
      {fullscreen && (
        <div className="flex items-center justify-between border-b border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-3 py-1.5 text-xs">
          <span className="text-[var(--workspace-muted)]">
            전체화면 · Esc 또는 F로 종료 · Ctrl+Z 실행취소
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setFullscreen(false)}
          >
            종료
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1 bg-[var(--workspace-border)] p-px">
          <MultiChartGrid mode={layoutMode}>
            {paneSymbols.map((id, idx) => {
              const paneTf =
                sync.interval || layoutMode === "single"
                  ? timeframe
                  : (paneTimeframes[idx] ?? timeframe);
              return (
                <SymbolChartPane
                  key={`${layoutMode}-${idx}-${id}`}
                  symbolId={id}
                  paneTimeframe={paneTf}
                  interactive
                  paneIndex={idx}
                  active={activePaneIndex === idx}
                  onActivate={() => setActivePaneIndex(idx)}
                  className="h-full min-h-0"
                />
              );
            })}
          </MultiChartGrid>
        </main>
        {!fullscreen && (
          <div className="hidden w-[360px] shrink-0 lg:block">
            <RightPanel />
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-3 py-1.5 text-[10px] text-[var(--workspace-faint)]">
        <span className="flex flex-wrap items-center gap-2">
          <span data-feature="data.session_status">{session.label}</span>
          {extBadge ? (
            <>
              <span>·</span>
              <span
                className="rounded bg-[var(--workspace-elevated)] px-1.5 py-0.5 text-[var(--workspace-muted)]"
                data-feature="chart.extended_hours"
              >
                {extBadge}
              </span>
            </>
          ) : null}
          <span>·</span>
          <label
            className="inline-flex items-center gap-1"
            data-feature="chart.timezone"
          >
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-5 rounded border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] px-1 text-[10px] text-[var(--workspace-muted)]"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {timezoneDisplay(tz, clock)}
                </option>
              ))}
            </select>
          </label>
          <span>· {tzNow}</span>
          {magnet ? " · 자석 ON" : " · 자석 OFF"}
          {drawingsLocked ? " · 잠금" : ""}
        </span>
        <span>
          Ctrl+Z 실행취소 · Y 수평레이 · L 잠금 · A 알림 · O 오브젝트
        </span>
      </footer>

      <IngestDialog open={ingestOpen} onOpenChange={setIngestOpen} />
      <CommandPalette />
      <Phase3Panels />
      <Phase4Panels />
    </div>
  );
}
