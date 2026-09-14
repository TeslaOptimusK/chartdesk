"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Columns2,
  Crosshair,
  Eraser,
  LayoutGrid,
  LineChart,
  Magnet,
  Maximize2,
  Minus,
  MoveDiagonal,
  MoveHorizontal,
  MoveVertical,
  Percent,
  Ruler,
  Search,
  Square,
  Type,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useWorkspace, type IndicatorId, type LayoutMode } from "@/lib/store";
import { DRAWING_TOOL_META } from "@/lib/drawings";
import {
  TIMEFRAME_LABELS,
  type ChartStyle,
  type DrawingKind,
  type DrawingTool,
  type Timeframe,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TFS: Timeframe[] = ["1", "5", "15", "60", "240", "D"];
const INDICATORS: { id: IndicatorId; label: string }[] = [
  { id: "sma20", label: "SMA20" },
  { id: "ema9", label: "EMA9" },
  { id: "bb", label: "BB" },
  { id: "rsi", label: "RSI" },
  { id: "macd", label: "MACD" },
  { id: "atr", label: "ATR" },
  { id: "vwap", label: "VWAP" },
  { id: "volMa", label: "VolMA" },
];
const CHART_STYLES: { id: ChartStyle; label: string }[] = [
  { id: "candle", label: "캔들" },
  { id: "bar", label: "바" },
  { id: "line", label: "라인" },
  { id: "area", label: "영역" },
  { id: "heikin_ashi", label: "하이킨" },
];

const DRAWING_ICONS: Record<
  DrawingKind,
  React.ComponentType<{ className?: string }>
> = {
  trend: TrendingUp,
  ray: MoveDiagonal,
  horizontal: Minus,
  vertical: MoveVertical,
  channel: MoveHorizontal,
  fibonacci: Percent,
  rectangle: Square,
  measure: Ruler,
  text: Type,
};

export function ChartToolbar({ onOpenIngest }: { onOpenIngest: () => void }) {
  const {
    symbols,
    activeSymbolId,
    setActiveSymbol,
    timeframe,
    setTimeframe,
    indicators,
    toggleIndicator,
    drawingTool,
    setDrawingTool,
    layoutMode,
    setLayoutMode,
    alerts,
    setRightTab,
    drawings,
    setDrawings,
    chartStyle,
    setChartStyle,
    compareSymbolId,
    setCompareSymbolId,
    magnet,
    setMagnet,
    setFullscreen,
    goToDate,
    setGoToDate,
    timezone,
    saveLayout,
    loadLayout,
    deleteLayout,
    layouts,
  } = useWorkspace();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dateInput, setDateInput] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return symbols.slice(0, 12);
    return symbols
      .filter((s) =>
        [s.ticker, s.nameKo, s.nameEn, ...s.aliases]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 12);
  }, [query, symbols]);

  const active = symbols.find((s) => s.id === activeSymbolId);
  const unread = alerts.filter((a) => !a.read).length;

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-3 py-2">
      <div className="mr-1 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]">
          <LineChart className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-wide text-[var(--workspace-fg)]">
            ChartDesk
          </div>
          <div className="text-[10px] text-[var(--workspace-faint)]">
            {timezone}
          </div>
        </div>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="min-w-[150px] justify-start border-[var(--workspace-border)] bg-[var(--workspace-elevated)] text-[var(--workspace-fg)]"
            />
          }
        >
          <Search className="mr-2 h-3.5 w-3.5 opacity-60" />
          {active ? `${active.ticker} · ${active.nameKo}` : "심볼 검색"}
        </PopoverTrigger>
        <PopoverContent className="w-80 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
          <Input
            autoFocus
            placeholder="티커, 종목명…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
          />
          <div className="max-h-64 space-y-1 overflow-auto">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--workspace-panel)]"
                onClick={() => {
                  setActiveSymbol(s.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>
                  <span className="font-medium">{s.ticker}</span>{" "}
                  <span className="text-[var(--workspace-muted)]">{s.nameKo}</span>
                </span>
                <span className="text-[10px] uppercase text-[var(--workspace-faint)]">
                  {s.assetClass.replace("_", " ")}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex items-center rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-0.5">
        {TFS.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={cn(
              "rounded px-2 py-1 text-xs",
              timeframe === tf
                ? "bg-[var(--brand-accent)] font-semibold text-[#0b1016]"
                : "text-[var(--workspace-muted)] hover:text-[var(--workspace-fg)]"
            )}
          >
            {TIMEFRAME_LABELS[tf]}
          </button>
        ))}
      </div>

      <div className="flex items-center rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-0.5">
        {CHART_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setChartStyle(s.id)}
            className={cn(
              "rounded px-1.5 py-1 text-[10px]",
              chartStyle === s.id
                ? "bg-[var(--brand-accent)] font-semibold text-[#0b1016]"
                : "text-[var(--workspace-muted)] hover:text-[var(--workspace-fg)]"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex max-w-[280px] flex-wrap items-center gap-1">
        {INDICATORS.map((ind) => (
          <Button
            key={ind.id}
            size="sm"
            variant={indicators.includes(ind.id) ? "default" : "ghost"}
            className={cn(
              "h-7 px-1.5 text-[10px]",
              indicators.includes(ind.id) &&
                "bg-[var(--brand-accent)] text-[#0b1016] hover:bg-[var(--brand-accent)]/90"
            )}
            onClick={() => toggleIndicator(ind.id)}
          >
            {ind.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-0.5 border-l border-[var(--workspace-border)] pl-2">
        {DRAWING_TOOL_META.map((meta) => {
          const Icon = DRAWING_ICONS[meta.id];
          return (
            <ToolBtn
              key={meta.id}
              active={drawingTool === meta.id}
              onClick={() =>
                setDrawingTool(
                  drawingTool === meta.id ? "none" : (meta.id as DrawingTool)
                )
              }
              title={`${meta.label} — ${meta.hint}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </ToolBtn>
          );
        })}
        <ToolBtn
          active={magnet}
          onClick={() => setMagnet(!magnet)}
          title="자석(캔들 OHLC 스냅)"
        >
          <Magnet className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={false}
          onClick={async () => {
            const next = drawings.filter((d) => d.symbolId !== activeSymbolId);
            setDrawings(next);
            setDrawingTool("none");
            await fetch("/api/drawings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ symbolId: activeSymbolId, drawings: [] }),
            });
          }}
          title="현재 심볼 드로잉 지우기"
        >
          <Eraser className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      <div className="flex items-center gap-1 border-l border-[var(--workspace-border)] pl-2">
        {(
          [
            ["single", Square],
            ["split2", Columns2],
            ["split4", LayoutGrid],
          ] as const
        ).map(([mode, Icon]) => (
          <ToolBtn
            key={mode}
            active={layoutMode === mode}
            onClick={() => setLayoutMode(mode as LayoutMode)}
            title={mode}
          >
            <Icon className="h-3.5 w-3.5" />
          </ToolBtn>
        ))}
        <ToolBtn
          active={false}
          onClick={() => setFullscreen(true)}
          title="전체화면 (F)"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-[var(--workspace-border)] text-[10px]"
            />
          }
        >
          비교
        </PopoverTrigger>
        <PopoverContent className="w-56 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
          <button
            type="button"
            className="mb-1 w-full rounded px-2 py-1 text-left text-xs hover:bg-[var(--workspace-panel)]"
            onClick={() => setCompareSymbolId(null)}
          >
            오버레이 끄기
          </button>
          {symbols
            .filter((s) => s.id !== activeSymbolId)
            .map((s) => (
              <button
                key={s.id}
                type="button"
                className={cn(
                  "w-full rounded px-2 py-1 text-left text-xs hover:bg-[var(--workspace-panel)]",
                  compareSymbolId === s.id && "bg-[var(--workspace-panel)]"
                )}
                onClick={() => setCompareSymbolId(s.id)}
              >
                {s.ticker} · {s.nameKo}
              </button>
            ))}
        </PopoverContent>
      </Popover>

      <div className="flex items-center gap-1">
        <Input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="h-7 w-[130px] border-[var(--workspace-border)] bg-[var(--workspace-elevated)] text-[10px]"
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px]"
          onClick={() => setGoToDate(dateInput || null)}
        >
          이동
        </Button>
        {goToDate && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px]"
            onClick={() => {
              setGoToDate(null);
              setDateInput("");
            }}
          >
            리셋
          </Button>
        )}
      </div>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-[var(--workspace-border)] text-[10px]"
            />
          }
        >
          레이아웃
        </PopoverTrigger>
        <PopoverContent className="w-64 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
          <Button
            size="sm"
            className="mb-2 h-7 w-full bg-[var(--brand-accent)] text-[#0b1016] text-xs"
            onClick={() => {
              const name = window.prompt(
                "레이아웃 이름",
                `${active?.ticker ?? "chart"} ${timeframe}`
              );
              if (name?.trim()) saveLayout(name.trim());
            }}
          >
            현재 레이아웃 저장
          </Button>
          <div className="max-h-48 space-y-1 overflow-auto">
            {layouts.length === 0 && (
              <div className="px-1 py-3 text-center text-[11px] text-[var(--workspace-muted)]">
                저장된 레이아웃 없음
              </div>
            )}
            {layouts.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-1 rounded px-1 py-1 hover:bg-[var(--workspace-panel)]"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs"
                  onClick={() => loadLayout(l.id)}
                >
                  {l.name}
                </button>
                <button
                  type="button"
                  className="text-[10px] text-rose-300"
                  onClick={() => deleteLayout(l.id)}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="border-[var(--workspace-border)] text-xs"
          onClick={onOpenIngest}
        >
          포스트 인제스트
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="relative"
          onClick={() => setRightTab("alerts")}
          title="알림"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-accent)] px-1 text-[10px] font-bold text-[#0b1016]">
              {unread}
            </span>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRightTab("objects")}
          title="오브젝트 트리"
        >
          <Crosshair className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md",
        active
          ? "bg-[var(--brand-accent)] text-[#0b1016]"
          : "text-[var(--workspace-muted)] hover:bg-[var(--workspace-elevated)] hover:text-[var(--workspace-fg)]"
      )}
    >
      {children}
    </button>
  );
}
