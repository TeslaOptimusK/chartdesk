"use client";

import { useEffect, useState } from "react";
import { ChartToolbar } from "@/components/workspace/ChartToolbar";
import { IngestDialog } from "@/components/workspace/IngestDialog";
import { RightPanel } from "@/components/workspace/RightPanel";
import { SymbolChartPane } from "@/components/chart/SymbolChartPane";
import { useWorkspace } from "@/lib/store";
import type { DrawingTool, Timeframe } from "@/lib/types";
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
    showDisclaimer,
    setShowDisclaimer,
    watchlist,
    fullscreen,
    setFullscreen,
    timezone,
    setTimeframe,
    setDrawingTool,
    setMagnet,
    magnet,
    setRightTab,
    drawingTool,
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

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setRightTab("alerts");
        return;
      }

      if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setRightTab("objects");
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
  ]);

  const paneSymbols =
    layoutMode === "single"
      ? [activeSymbolId]
      : layoutMode === "split2"
        ? [activeSymbolId, secondarySymbolIds[0] ?? watchlist[1] ?? activeSymbolId]
        : [
            activeSymbolId,
            secondarySymbolIds[0] ?? watchlist[1] ?? activeSymbolId,
            secondarySymbolIds[1] ?? watchlist[2] ?? activeSymbolId,
            secondarySymbolIds[2] ?? watchlist[3] ?? activeSymbolId,
          ];

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
            전체화면 · Esc 또는 F로 종료 · 핫키: 1/5/6/7/8/9 TF · T/R/H/V 드로잉
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
        <main
          className={cn(
            "grid min-w-0 flex-1 gap-px bg-[var(--workspace-border)]",
            layoutMode === "single" && "grid-cols-1",
            layoutMode === "split2" && "grid-cols-1 md:grid-cols-2",
            layoutMode === "split4" && "grid-cols-1 md:grid-cols-2"
          )}
        >
          {paneSymbols.map((id, idx) => (
            <SymbolChartPane
              key={`${layoutMode}-${id}-${idx}`}
              symbolId={id}
              height={
                fullscreen
                  ? 720
                  : layoutMode === "single"
                    ? 560
                    : layoutMode === "split2"
                      ? 520
                      : 280
              }
              interactive={idx === 0}
              className="min-h-0"
            />
          ))}
        </main>
        {!fullscreen && (
          <div className="hidden w-[340px] shrink-0 lg:block">
            <RightPanel />
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-3 py-1.5 text-[10px] text-[var(--workspace-faint)]">
        <span>
          시세: mock/delayed · 세션 {timezone} · {tzNow}
          {magnet ? " · 자석 ON" : " · 자석 OFF"}
        </span>
        <span>
          핫키 1/5/6/7/8/9 TF · T/R/H/V/C/B/Q/M 드로잉 · N 자석 · F 전체화면 · A
          알림 · O 오브젝트
        </span>
      </footer>

      <IngestDialog open={ingestOpen} onOpenChange={setIngestOpen} />
    </div>
  );
}
