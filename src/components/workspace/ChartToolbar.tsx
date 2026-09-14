"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Columns2,
  LayoutGrid,
  LineChart,
  Minus,
  Search,
  Square,
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
import { TIMEFRAME_LABELS, type Timeframe } from "@/lib/types";
import { cn } from "@/lib/utils";

const TFS: Timeframe[] = ["1", "5", "15", "60", "240", "D"];
const INDICATORS: { id: IndicatorId; label: string }[] = [
  { id: "sma20", label: "SMA 20" },
  { id: "ema9", label: "EMA 9" },
  { id: "bb", label: "Bollinger" },
  { id: "rsi", label: "RSI (패널)" },
];

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
  } = useWorkspace();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

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
      <div className="mr-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]">
          <LineChart className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-wide text-[var(--workspace-fg)]">
            ChartDesk
          </div>
          <div className="text-[10px] text-[var(--workspace-faint)]">
            easychart research desk
          </div>
        </div>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="min-w-[160px] justify-start border-[var(--workspace-border)] bg-[var(--workspace-elevated)] text-[var(--workspace-fg)]"
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
            {filtered.length === 0 && (
              <div className="px-2 py-4 text-center text-xs text-[var(--workspace-muted)]">
                검색 결과 없음
              </div>
            )}
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
                ? "bg-[var(--brand-accent)] text-[#0b1016] font-semibold"
                : "text-[var(--workspace-muted)] hover:text-[var(--workspace-fg)]"
            )}
          >
            {TIMEFRAME_LABELS[tf]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        {INDICATORS.map((ind) => (
          <Button
            key={ind.id}
            size="sm"
            variant={indicators.includes(ind.id) ? "default" : "ghost"}
            className={cn(
              "h-8 text-xs",
              indicators.includes(ind.id) &&
                "bg-[var(--brand-accent)] text-[#0b1016] hover:bg-[var(--brand-accent)]/90"
            )}
            onClick={() => toggleIndicator(ind.id)}
          >
            {ind.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-1 border-l border-[var(--workspace-border)] pl-2">
        <ToolBtn
          active={drawingTool === "trend"}
          onClick={() =>
            setDrawingTool(drawingTool === "trend" ? "none" : "trend")
          }
          title="추세선"
        >
          <TrendingUp className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={drawingTool === "horizontal"}
          onClick={() =>
            setDrawingTool(drawingTool === "horizontal" ? "none" : "horizontal")
          }
          title="수평선"
        >
          <Minus className="h-3.5 w-3.5" />
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
      </div>

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
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-accent)] px-1 text-[10px] font-bold text-[#0b1016]">
              {unread}
            </span>
          )}
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
        "flex h-8 w-8 items-center justify-center rounded-md",
        active
          ? "bg-[var(--brand-accent)] text-[#0b1016]"
          : "text-[var(--workspace-muted)] hover:bg-[var(--workspace-elevated)] hover:text-[var(--workspace-fg)]"
      )}
    >
      {children}
    </button>
  );
}
