"use client";

import { useEffect, useState } from "react";
import { ChartToolbar } from "@/components/workspace/ChartToolbar";
import { IngestDialog } from "@/components/workspace/IngestDialog";
import { RightPanel } from "@/components/workspace/RightPanel";
import { SymbolChartPane } from "@/components/chart/SymbolChartPane";
import { useWorkspace } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  } = useWorkspace();
  const [ingestOpen, setIngestOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bootstrap")
      .then(async (r) => {
        if (!r.ok) throw new Error("부트스트랩 실패");
        return r.json();
      })
      .then((data) => hydrate(data))
      .catch((e: Error) => setBootError(e.message));
  }, [hydrate]);

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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--workspace-bg)] text-[var(--workspace-fg)]">
      {showDisclaimer && (
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

      <ChartToolbar onOpenIngest={() => setIngestOpen(true)} />

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
              height={layoutMode === "single" ? 560 : layoutMode === "split2" ? 520 : 280}
              interactive={idx === 0}
              className="min-h-0"
            />
          ))}
        </main>
        <div className="hidden w-[340px] shrink-0 lg:block">
          <RightPanel />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-3 py-1.5 text-[10px] text-[var(--workspace-faint)]">
        <span>
          시세: mock/delayed 어댑터 · LLM 키 없으면 규칙 기반 초안 · 드로잉 로컬
          저장
        </span>
        <span>원문 미러링 없음 · 의견은 사람 승인 후 게시</span>
      </footer>

      <IngestDialog open={ingestOpen} onOpenChange={setIngestOpen} />
    </div>
  );
}
