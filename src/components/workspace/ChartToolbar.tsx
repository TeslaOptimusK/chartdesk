"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Columns2,
  Lock,
  LockOpen,
  LayoutGrid,
  LineChart,
  Magnet,
  Maximize2,
  Minus,
  MoveDiagonal,
  MoveHorizontal,
  MoveVertical,
  Percent,
  Redo2,
  Ruler,
  Search,
  Settings,
  Square,
  Type,
  TrendingUp,
  Undo2,
  ArrowRightFromLine,
  ListTree,
  Camera,
  Command,
  Star,
  Play,
  Pause,
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
  SYMBOL_CHIP_IDS,
  TIMEFRAME_LABELS,
  ALL_TIMEFRAMES,
  RANGE_PRESET_LABELS,
  INDICATOR_TEMPLATES,
  type ChartStyle,
  type DrawingKind,
  type DrawingTool,
  type RangePreset,
  type Timeframe,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TFS: Timeframe[] = ALL_TIMEFRAMES;
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
const CHART_STYLES: { id: ChartStyle; label: string; feature?: string }[] = [
  { id: "candle", label: "캔들" },
  { id: "bar", label: "바", feature: "chart.type.bars" },
  { id: "hollow_candle", label: "중공", feature: "chart.type.hollow_candles" },
  { id: "line", label: "라인" },
  { id: "area", label: "영역", feature: "chart.type.area" },
  { id: "baseline", label: "베이스", feature: "chart.type.baseline" },
  { id: "heikin_ashi", label: "하이킨" },
  { id: "renko", label: "렌코", feature: "chart.type.renko" },
  { id: "kagi", label: "카기", feature: "chart.type.kagi" },
  { id: "line_break", label: "LB", feature: "chart.type.line_break" },
  { id: "point_figure", label: "PnF", feature: "chart.type.point_figure" },
  { id: "range", label: "레인지", feature: "chart.type.range" },
  {
    id: "volume_candles",
    label: "Vol캔",
    feature: "chart.type.volume_candles",
  },
];

const DRAWING_ICONS: Record<
  DrawingKind,
  React.ComponentType<{ className?: string }>
> = {
  trend: TrendingUp,
  ray: MoveDiagonal,
  horizontal: Minus,
  horizontal_ray: ArrowRightFromLine,
  vertical: MoveVertical,
  channel: MoveHorizontal,
  fibonacci: Percent,
  rectangle: Square,
  measure: Ruler,
  text: Type,
  extended: MoveDiagonal,
  long_position: TrendingUp,
  short_position: TrendingUp,
  vp_fixed: LayoutGrid,
  anchored_vwap: LineChart,
  pitchfork: MoveDiagonal,
  fib_extension: Percent,
  fib_arc: Percent,
  fib_fan: Percent,
  fib_timezone: Percent,
  gann_box: Square,
  gann_fan: MoveDiagonal,
  pattern_harmonic: TrendingUp,
  pattern_elliott: TrendingUp,
  brush: Minus,
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
    drawingsLocked,
    setDrawingsLocked,
    setFullscreen,
    goToDate,
    setGoToDate,
    timezone,
    saveLayout,
    loadLayout,
    deleteLayout,
    layouts,
    undoDrawings,
    redoDrawings,
    undoStack,
    redoStack,
    chartSettings,
    setChartSettings,
    objectTreeOpen,
    setObjectTreeOpen,
    rangePreset,
    setRangePreset,
    dateFormat,
    setDateFormat,
    extendedHours,
    setExtendedHours,
    priceScaleMode,
    setPriceScaleMode,
    showCountdown,
    setShowCountdown,
    sync,
    setSync,
    favoriteTools,
    toggleFavoriteTool,
    stayInDrawMode,
    setStayInDrawMode,
    customIntervalMinutes,
    setCustomIntervalMinutes,
    setIndicatorDialogOpen,
    setCommandPaletteOpen,
    applyIndicatorTemplate,
    requestSnapshot,
    replayActive,
    setReplayActive,
    replayIndex,
    setReplayIndex,
    eventToggles,
    setEventToggles,
    setScreenerOpen,
    setHeatmapOpen,
    setPaperOpen,
    setFundGraphsOpen,
    setPortfolioOpen,
    setSeasonalsOpen,
    setCustomIndicatorOpen,
  } = useWorkspace();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customMin, setCustomMin] = useState("");

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
  const localDrawings = drawings.filter((d) => d.symbolId === activeSymbolId);

  const persistLocal = async (nextLocal: typeof localDrawings) => {
    const merged = [
      ...drawings.filter((d) => d.symbolId !== activeSymbolId),
      ...nextLocal,
    ];
    setDrawings(merged);
    await fetch("/api/drawings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbolId: activeSymbolId, drawings: nextLocal }),
    });
  };

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-3 py-2">
      {/* Feature ID: shell.brand */}
      <div className="mr-1 flex items-center gap-2" data-feature="shell.brand">
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

      {/* Feature ID: symbol.search */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="min-w-[150px] justify-start border-[var(--workspace-border)] bg-[var(--workspace-elevated)] text-[var(--workspace-fg)]"
              data-feature="symbol.search"
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
                  {s.exchange}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Feature ID: chart.interval.full */}
      <div
        className="flex max-w-[420px] flex-wrap items-center rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-0.5"
        data-feature="chart.interval.full"
      >
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

      <div
        className="flex items-center gap-1"
        data-feature="chart.interval.custom"
      >
        <Input
          type="number"
          min={1}
          max={240}
          placeholder="7"
          value={customMin}
          onChange={(e) => setCustomMin(e.target.value)}
          className="h-7 w-12 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] text-[10px]"
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px]"
          onClick={() => {
            const n = Number(customMin);
            setCustomIntervalMinutes(Number.isFinite(n) && n > 0 ? n : null);
          }}
        >
          분
        </Button>
        {customIntervalMinutes && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px]"
            onClick={() => {
              setCustomIntervalMinutes(null);
              setCustomMin("");
            }}
          >
            리셋
          </Button>
        )}
      </div>

      <div
        className="flex items-center rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-0.5"
        data-feature="chart.range_preset"
      >
        {(Object.keys(RANGE_PRESET_LABELS) as RangePreset[]).map((rp) => (
          <button
            key={rp}
            type="button"
            onClick={() => setRangePreset(rp)}
            className={cn(
              "rounded px-1.5 py-1 text-[10px]",
              rangePreset === rp
                ? "bg-[var(--brand-accent)] font-semibold text-[#0b1016]"
                : "text-[var(--workspace-muted)]"
            )}
          >
            {RANGE_PRESET_LABELS[rp]}
          </button>
        ))}
      </div>

      {/* Feature IDs: chart.type.* */}
      <div
        className="flex items-center rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-0.5"
        data-feature="chart.type.candles"
      >
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
            data-feature={
              s.feature ??
              (s.id === "candle"
                ? "chart.type.candles"
                : s.id === "line"
                  ? "chart.type.line"
                  : s.id === "heikin_ashi"
                    ? "chart.type.heikin_ashi"
                    : undefined)
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Feature ID: symbol.chips */}
      <div
        className="flex max-w-[360px] flex-wrap items-center gap-1"
        data-feature="symbol.chips"
      >
        {SYMBOL_CHIP_IDS.map((id) => {
          const s = symbols.find((x) => x.id === id);
          if (!s) return null;
          const on =
            compareSymbolId === id ||
            activeSymbolId === id;
          return (
            <button
              key={id}
              type="button"
              title={`${s.ticker} · ${s.nameKo}`}
              onClick={() => {
                if (activeSymbolId === id) return;
                if (compareSymbolId === id) setCompareSymbolId(null);
                else setCompareSymbolId(id);
              }}
              onDoubleClick={() => setActiveSymbol(id)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                on
                  ? "bg-[var(--brand-accent)] text-[#0b1016]"
                  : "bg-[var(--workspace-elevated)] text-[var(--workspace-muted)] hover:text-[var(--workspace-fg)]"
              )}
            >
              {s.ticker}
            </button>
          );
        })}
      </div>

      <div className="flex max-w-[280px] flex-wrap items-center gap-1" data-feature="indicator.overlay">
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

      <div
        className="flex items-center gap-0.5 border-l border-[var(--workspace-border)] pl-2"
        data-feature="draw.favorites"
      >
        {favoriteTools.map((id) => {
          const meta = DRAWING_TOOL_META.find((m) => m.id === id);
          if (!meta) return null;
          const Icon = DRAWING_ICONS[meta.id];
          return (
            <ToolBtn
              key={`fav-${meta.id}`}
              active={drawingTool === meta.id}
              onClick={() =>
                setDrawingTool(
                  drawingTool === meta.id ? "none" : (meta.id as DrawingTool)
                )
              }
              title={`★ ${meta.label}`}
              dataFeature={meta.featureId}
            >
              <Icon className="h-3.5 w-3.5" />
            </ToolBtn>
          );
        })}
        <ToolBtn
          active={stayInDrawMode}
          onClick={() => setStayInDrawMode(!stayInDrawMode)}
          title="연속 그리기"
          dataFeature="draw.stay_in_mode"
        >
          <Star className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      <div className="flex items-center gap-0.5 border-l border-[var(--workspace-border)] pl-2">
        {DRAWING_TOOL_META.map((meta) => {
          const Icon = DRAWING_ICONS[meta.id];
          return (
            <ToolBtn
              key={meta.id}
              active={drawingTool === meta.id}
              onClick={(e) => {
                if (e.shiftKey) {
                  toggleFavoriteTool(meta.id);
                  return;
                }
                setDrawingTool(
                  drawingTool === meta.id ? "none" : (meta.id as DrawingTool)
                );
              }}
              title={`${meta.label} — ${meta.hint} (Shift=즐겨찾기)`}
              dataFeature={meta.featureId}
            >
              <Icon className="h-3.5 w-3.5" />
            </ToolBtn>
          );
        })}
        <ToolBtn
          active={magnet}
          onClick={() => setMagnet(!magnet)}
          title="자석(캔들 OHLC 스냅) — draw.magnet.weak"
          dataFeature="draw.magnet.weak"
        >
          <Magnet className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={drawingsLocked}
          onClick={() => setDrawingsLocked(!drawingsLocked)}
          title="드로잉 잠금 — draw.lock_all"
          dataFeature="draw.lock_all"
        >
          {drawingsLocked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <LockOpen className="h-3.5 w-3.5" />
          )}
        </ToolBtn>
        <ToolBtn
          active={false}
          disabled={!undoStack.length}
          onClick={() => {
            undoDrawings();
            // persist after undo via effect in pane — push current to server
            const next = useWorkspace.getState().drawings.filter(
              (d) => d.symbolId === activeSymbolId
            );
            void fetch("/api/drawings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbolId: activeSymbolId,
                drawings: next,
              }),
            });
          }}
          title="실행취소 — chart.undo"
          dataFeature="chart.undo"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          active={false}
          disabled={!redoStack.length}
          onClick={() => {
            redoDrawings();
            const next = useWorkspace.getState().drawings.filter(
              (d) => d.symbolId === activeSymbolId
            );
            void fetch("/api/drawings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbolId: activeSymbolId,
                drawings: next,
              }),
            });
          }}
          title="재실행 — chart.undo"
        >
          <Redo2 className="h-3.5 w-3.5" />
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

      {/* Feature ID: symbol.compare */}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-[var(--workspace-border)] text-[10px]"
              data-feature="symbol.compare"
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

      <div className="flex items-center gap-1" data-feature="chart.goto">
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

      {/* Feature ID: layout.save */}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-[var(--workspace-border)] text-[10px]"
              data-feature="layout.save"
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

      <select
        value={dateFormat}
        onChange={(e) =>
          setDateFormat(e.target.value as typeof dateFormat)
        }
        className="h-7 rounded border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] px-1 text-[10px]"
        data-feature="chart.date_format"
      >
        <option value="mm/dd/yyyy">mm/dd/yyyy</option>
        <option value="yyyy-mm-dd">yyyy-mm-dd</option>
        <option value="dd/mm/yyyy">dd/mm/yyyy</option>
      </select>

      <label
        className="flex items-center gap-1 text-[10px] text-[var(--workspace-muted)]"
        data-feature="chart.extended_hours"
      >
        <input
          type="checkbox"
          checked={extendedHours}
          onChange={(e) => setExtendedHours(e.target.checked)}
        />
        EH
      </label>

      <div className="flex items-center gap-0.5" data-feature="scale.log">
        {(
          [
            ["linear", "Lin"],
            ["log", "Log"],
            ["percent", "%"],
            ["indexed_100", "100"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setPriceScaleMode(mode)}
            data-feature={
              mode === "log"
                ? "scale.log"
                : mode === "percent"
                  ? "scale.percent"
                  : mode === "indexed_100"
                    ? "scale.indexed_100"
                    : undefined
            }
            className={cn(
              "rounded px-1.5 py-1 text-[10px]",
              priceScaleMode === mode
                ? "bg-[var(--brand-accent)] text-[#0b1016]"
                : "text-[var(--workspace-muted)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <label
        className="flex items-center gap-1 text-[10px]"
        data-feature="scale.countdown"
      >
        <input
          type="checkbox"
          checked={showCountdown}
          onChange={(e) => setShowCountdown(e.target.checked)}
        />
        CD
      </label>

      <div className="flex flex-wrap items-center gap-1 text-[10px]" data-feature="draw.sync.layout">
        {(
          [
            ["symbol", "Sym", "layout.sync.symbol"],
            ["interval", "Int", "layout.sync.interval"],
            ["crosshair", "Xhair", "layout.sync.crosshair"],
            ["drawings", "Drw", "layout.sync.drawings"],
          ] as const
        ).map(([key, label, feat]) => (
          <label key={key} className="flex items-center gap-0.5" data-feature={feat}>
            <input
              type="checkbox"
              checked={sync[key]}
              onChange={(e) => setSync({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-[10px]"
        data-feature="chart.snapshot"
        onClick={() => requestSnapshot()}
      >
        <Camera className="mr-1 h-3.5 w-3.5" />
        Snap
      </Button>

      <div className="flex items-center gap-1" data-feature="replay">
        <Button
          size="sm"
          variant={replayActive ? "default" : "ghost"}
          className="h-7 px-2 text-[10px]"
          onClick={() => setReplayActive(!replayActive)}
        >
          {replayActive ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </Button>
        {replayActive && (
          <input
            type="range"
            min={10}
            max={200}
            value={replayIndex ?? 180}
            onChange={(e) => setReplayIndex(Number(e.target.value))}
            className="w-20"
          />
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-[10px]"
        data-feature="indicator.dialog"
        onClick={() => setIndicatorDialogOpen(true)}
      >
        /
      </Button>

      <div className="flex flex-wrap items-center gap-0.5 border-l border-[var(--workspace-border)] pl-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-[10px]"
          data-feature="screener.stock"
          onClick={() => setScreenerOpen(true)}
        >
          Scr
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-[10px]"
          data-feature="heatmap"
          onClick={() => setHeatmapOpen(true)}
        >
          Heat
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-[10px]"
          data-feature="trade.paper"
          onClick={() => setPaperOpen(true)}
        >
          Paper
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-[10px]"
          data-feature="fund.graphs"
          onClick={() => setFundGraphsOpen(true)}
        >
          Fund
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-[10px]"
          data-feature="portfolio"
          onClick={() => setPortfolioOpen(true)}
        >
          Port
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-[10px]"
          data-feature="chart.seasonals"
          onClick={() => setSeasonalsOpen(true)}
        >
          Seasn
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-[10px]"
          data-feature="indicator.custom_js"
          onClick={() => setCustomIndicatorOpen(true)}
        >
          JS
        </Button>
      </div>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px]"
              data-feature="indicator.template"
            />
          }
        >
          Tpl
        </PopoverTrigger>
        <PopoverContent className="w-48 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
          {INDICATOR_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="mb-1 w-full rounded px-2 py-1 text-left text-xs hover:bg-[var(--workspace-panel)]"
              onClick={() => applyIndicatorTemplate(tpl.id)}
            >
              {tpl.name}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        data-feature="shell.command_palette"
        onClick={() => setCommandPaletteOpen(true)}
        title="Ctrl+K"
      >
        <Command className="h-3.5 w-3.5" />
      </Button>

      {/* Feature ID: chart.settings */}
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              data-feature="chart.settings"
              title="차트 설정"
            />
          }
        >
          <Settings className="h-3.5 w-3.5" />
        </PopoverTrigger>
        <PopoverContent className="w-64 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-3">
          <div className="mb-2 text-xs font-semibold text-[var(--workspace-fg)]">
            차트 설정
          </div>
          <label className="mb-2 flex items-center justify-between text-[11px] text-[var(--workspace-muted)]">
            그리드
            <input
              type="checkbox"
              checked={chartSettings.showGrid}
              onChange={(e) =>
                setChartSettings({ showGrid: e.target.checked })
              }
            />
          </label>
          <label className="mb-2 flex items-center justify-between text-[11px] text-[var(--workspace-muted)]">
            워터마크
            <input
              type="checkbox"
              checked={chartSettings.showWatermark}
              onChange={(e) =>
                setChartSettings({ showWatermark: e.target.checked })
              }
            />
          </label>
          <input
            value={chartSettings.watermark}
            onChange={(e) => setChartSettings({ watermark: e.target.value })}
            className="mb-2 h-7 w-full rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-2 text-[11px]"
            data-feature="chart.canvas"
          />
          <div className="mb-2 text-[10px] text-[var(--workspace-faint)]">
            이벤트 마커
          </div>
          {(
            [
              ["earnings", "실적", "events.earnings"],
              ["dividends", "배당", "events.dividends"],
              ["splits", "분할", "events.splits"],
              ["news", "뉴스", "events.news"],
            ] as const
          ).map(([key, label, feat]) => (
            <label
              key={key}
              className="mb-1 flex items-center justify-between text-[11px]"
              data-feature={feat}
            >
              {label}
              <input
                type="checkbox"
                checked={eventToggles[key]}
                onChange={(e) => setEventToggles({ [key]: e.target.checked })}
              />
            </label>
          ))}
          {(
            [
              ["background", "배경"],
              ["gridColor", "그리드 색"],
              ["upColor", "상승"],
              ["downColor", "하락"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--workspace-muted)]"
            >
              {label}
              <input
                type="color"
                value={chartSettings[key]}
                onChange={(e) =>
                  setChartSettings({ [key]: e.target.value })
                }
                className="h-6 w-10 cursor-pointer border-0 bg-transparent"
              />
            </label>
          ))}
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

        {/* Feature ID: draw.object_tree + draw.scope.symbol */}
        <Popover open={objectTreeOpen} onOpenChange={setObjectTreeOpen}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                title="드로잉 오브젝트 트리"
                data-feature="draw.object_tree"
              />
            }
          >
            <ListTree className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent
            className="w-72 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2"
            data-feature="draw.scope.symbol"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-xs font-semibold text-[var(--workspace-fg)]">
                드로잉 · {active?.ticker ?? activeSymbolId}
              </div>
              {localDrawings.length > 0 && (
                <button
                  type="button"
                  className="text-[10px] text-rose-300"
                  disabled={drawingsLocked}
                  onClick={() => persistLocal([])}
                >
                  전부 삭제
                </button>
              )}
            </div>
            {localDrawings.length === 0 && (
              <div className="px-1 py-4 text-center text-xs text-[var(--workspace-muted)]">
                오브젝트 없음
              </div>
            )}
            {localDrawings.map((d) => (
              <div
                key={d.id}
                className="mb-1 flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--workspace-panel)]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: d.color }}
                />
                <div className="min-w-0 flex-1 text-xs text-[var(--workspace-fg)]">
                  <div className="font-medium capitalize">{d.tool}</div>
                  <div className="truncate text-[10px] text-[var(--workspace-faint)]">
                    {d.text?.trim() ||
                      d.points.map((p) => p.price.toFixed(1)).join(" → ")}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-[10px] text-rose-300 disabled:opacity-40"
                  disabled={drawingsLocked || d.locked}
                  onClick={() =>
                    persistLocal(localDrawings.filter((x) => x.id !== d.id))
                  }
                >
                  삭제
                </button>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
  disabled,
  dataFeature,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  dataFeature?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      data-feature={dataFeature}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md disabled:opacity-30",
        active
          ? "bg-[var(--brand-accent)] text-[#0b1016]"
          : "text-[var(--workspace-muted)] hover:bg-[var(--workspace-elevated)] hover:text-[var(--workspace-fg)]"
      )}
    >
      {children}
    </button>
  );
}
