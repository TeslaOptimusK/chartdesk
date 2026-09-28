"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  Columns2,
  Command,
  LayoutGrid,
  LineChart,
  ListTree,
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
  Star,
  Type,
  TrendingUp,
  Undo2,
  ArrowRightFromLine,
  Camera,
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
import { KiwoomAccountDialog } from "@/components/workspace/KiwoomAccountDialog";
import { useWorkspace, type IndicatorId } from "@/lib/store";
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

const QUICK_TFS: Timeframe[] = ["1", "5", "15", "60", "D"];
const INDICATORS: { id: IndicatorId; label: string }[] = [
  { id: "sma20", label: "SMA 20" },
  { id: "ema9", label: "EMA 9" },
  { id: "bb", label: "볼린저" },
  { id: "volume", label: "거래량" },
  { id: "rsi", label: "RSI" },
  { id: "macd", label: "MACD" },
  { id: "stochRsi", label: "Stoch RSI" },
  { id: "atr", label: "ATR" },
  { id: "vwap", label: "VWAP" },
  { id: "volMa", label: "거래량 이평" },
];
const CHART_STYLES: { id: ChartStyle; label: string; feature?: string }[] = [
  { id: "candle", label: "캔들" },
  { id: "bar", label: "바", feature: "chart.type.bars" },
  { id: "hollow_candle", label: "중공 캔들", feature: "chart.type.hollow_candles" },
  { id: "line", label: "라인" },
  { id: "area", label: "영역", feature: "chart.type.area" },
  { id: "baseline", label: "베이스라인", feature: "chart.type.baseline" },
  { id: "heikin_ashi", label: "하이킨아시" },
  { id: "renko", label: "렌코", feature: "chart.type.renko" },
  { id: "kagi", label: "카기", feature: "chart.type.kagi" },
  { id: "line_break", label: "라인브레이크", feature: "chart.type.line_break" },
  { id: "point_figure", label: "포인트앤피겨", feature: "chart.type.point_figure" },
  { id: "range", label: "레인지", feature: "chart.type.range" },
  { id: "volume_candles", label: "거래량 캔들", feature: "chart.type.volume_candles" },
  { id: "volume_footprint", label: "풋프린트", feature: "chart.type.volume_footprint" },
  { id: "tpo", label: "TPO", feature: "chart.type.tpo" },
];

const DRAWING_ICONS: Record<DrawingKind, React.ComponentType<{ className?: string }>> = {
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

const DRAW_GROUPS: { title: string; ids: DrawingKind[] }[] = [
  { title: "선", ids: ["trend", "ray", "extended", "horizontal", "horizontal_ray", "vertical"] },
  { title: "피보나치", ids: ["fibonacci", "fib_extension", "fib_fan", "fib_arc", "fib_timezone"] },
  { title: "패턴", ids: ["channel", "pitchfork", "pattern_harmonic", "pattern_elliott", "gann_box", "gann_fan"] },
  {
    title: "표시",
    ids: ["rectangle", "brush", "text", "measure", "long_position", "short_position", "vp_fixed", "anchored_vwap"],
  },
];

function MenuGroup({
  title,
  children,
  feature,
}: {
  title: string;
  children: React.ReactNode;
  feature?: string;
}) {
  return (
    <section className="mb-3 last:mb-1" data-feature={feature}>
      <div className="px-1 pb-1 text-[11px] font-medium text-[var(--workspace-faint)]">{title}</div>
      <div className="overflow-hidden rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-panel)]">
        {children}
      </div>
    </section>
  );
}

function MenuRow({
  label,
  hint,
  onClick,
  active,
  feature,
  disabled,
  trailing,
}: {
  label: string;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
  feature?: string;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-feature={feature}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 border-b border-[var(--workspace-border)]/60 px-3 py-2.5 text-left last:border-b-0 disabled:opacity-40",
        active ? "bg-[var(--brand-accent)]/12" : "hover:bg-white/5"
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] text-[var(--workspace-fg)]">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] text-[var(--workspace-faint)]">{hint}</span>}
      </span>
      {trailing ?? (active ? <Check className="h-4 w-4 shrink-0 text-[var(--brand-accent)]" /> : null)}
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  feature,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  feature?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 border-b border-[var(--workspace-border)]/60 px-3 py-2.5 text-[13px] text-[var(--workspace-fg)] last:border-b-0",
        disabled && "opacity-40"
      )}
      data-feature={feature}
    >
      {label}
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--brand-accent)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function BarMenu({
  label,
  active,
  feature,
  children,
}: {
  label: string;
  active?: boolean;
  feature?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            data-feature={feature}
            className={cn(
              "h-8 shrink-0 gap-1 rounded-lg px-2.5 text-xs",
              active
                ? "bg-[var(--workspace-elevated)] text-[var(--workspace-fg)]"
                : "text-[var(--workspace-muted)]"
            )}
          />
        }
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="max-h-[min(70vh,560px)] w-[280px] overflow-auto border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
        {children}
      </PopoverContent>
    </Popover>
  );
}

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
    replayTotalBars,
    eventToggles,
    setEventToggles,
    setScreenerOpen,
    setHeatmapOpen,
    setPaperOpen,
    setFundGraphsOpen,
    setPortfolioOpen,
    setSeasonalsOpen,
    setCustomIndicatorOpen,
    setOptionsOpen,
    setYieldOpen,
    setMacroOpen,
    setBrokerOpen,
    setDomOpen,
    easyOverlayEnabled,
    setEasyOverlayEnabled,
    easyOverlayToggles,
    setEasyOverlayToggle,
    easyOverlayPreset,
    setEasyOverlayPreset,
    entrySignalsEnabled,
    setEntrySignalsEnabled,
  } = useWorkspace();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customMin, setCustomMin] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return symbols.slice(0, 12);
    return symbols
      .filter((s) =>
        [s.ticker, s.nameKo, s.nameEn, ...s.aliases].join(" ").toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [query, symbols]);

  const active = symbols.find((s) => s.id === activeSymbolId);
  const unread = alerts.filter((a) => !a.read).length;
  const localDrawings = drawings.filter((d) => d.symbolId === activeSymbolId);
  const styleLabel = CHART_STYLES.find((s) => s.id === chartStyle)?.label ?? "차트";
  const drawLabel =
    DRAWING_TOOL_META.find((m) => m.id === drawingTool)?.label ?? "그리기";

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

  const syncDrawings = () => {
    const next = useWorkspace.getState().drawings.filter((d) => d.symbolId === activeSymbolId);
    void fetch("/api/drawings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbolId: activeSymbolId, drawings: next }),
    });
  };

  return (
    <header className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-2 py-1.5 [scrollbar-width:thin]">
      <div className="mr-1 flex shrink-0 items-center gap-2" data-feature="shell.brand" title={timezone}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]">
          <LineChart className="h-4 w-4" />
        </div>
        <div className="text-sm font-semibold tracking-wide text-[var(--workspace-fg)]">ChartDesk</div>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-8 min-w-[148px] shrink-0 justify-start rounded-lg border-[var(--workspace-border)] bg-[var(--workspace-elevated)] text-xs text-[var(--workspace-fg)]"
              data-feature="symbol.search"
            />
          }
        >
          <Search className="mr-1.5 h-3.5 w-3.5 opacity-60" />
          {active ? `${active.ticker} · ${active.nameKo}` : "심볼"}
        </PopoverTrigger>
        <PopoverContent className="w-80 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
          <Input
            autoFocus
            placeholder="티커, 종목명…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
          />
          <div className="max-h-64 space-y-0.5 overflow-auto">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--workspace-panel)]"
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
                <span className="text-[10px] uppercase text-[var(--workspace-faint)]">{s.exchange}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 border-t border-[var(--workspace-border)] pt-2" data-feature="symbol.chips">
            <div className="px-1 pb-1 text-[11px] text-[var(--workspace-faint)]">클릭은 비교, 더블클릭은 종목 전환</div>
            <div className="flex flex-wrap gap-1">
              {SYMBOL_CHIP_IDS.map((id) => {
                const s = symbols.find((x) => x.id === id);
                if (!s) return null;
                const on = compareSymbolId === id || activeSymbolId === id;
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
                      "rounded-md px-2 py-1 text-[11px] font-medium",
                      on
                        ? "bg-[var(--brand-accent)] text-[#0b1016]"
                        : "bg-[var(--workspace-panel)] text-[var(--workspace-muted)]"
                    )}
                  >
                    {s.ticker}
                  </button>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <div
        className="flex shrink-0 items-center rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-0.5"
        data-feature="chart.interval.full"
      >
        {QUICK_TFS.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            className={cn(
              "rounded-md px-2 py-1 text-xs",
              timeframe === tf
                ? "bg-[var(--brand-accent)] font-semibold text-[#0b1016]"
                : "text-[var(--workspace-muted)] hover:text-[var(--workspace-fg)]"
            )}
          >
            {TIMEFRAME_LABELS[tf]}
          </button>
        ))}
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                className={cn(
                  "rounded-md px-2 py-1 text-xs",
                  !QUICK_TFS.includes(timeframe)
                    ? "bg-[var(--brand-accent)] font-semibold text-[#0b1016]"
                    : "text-[var(--workspace-muted)]"
                )}
              />
            }
          >
            {!QUICK_TFS.includes(timeframe) ? TIMEFRAME_LABELS[timeframe] : "간격"}
          </PopoverTrigger>
          <PopoverContent className="w-64 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
            <div className="grid grid-cols-4 gap-1">
              {ALL_TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  data-feature={tf === "tick" ? "chart.interval.tick" : undefined}
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    "rounded-lg py-2 text-xs",
                    timeframe === tf
                      ? "bg-[var(--brand-accent)] font-semibold text-[#0b1016]"
                      : "bg-[var(--workspace-panel)] text-[var(--workspace-muted)]"
                  )}
                >
                  {TIMEFRAME_LABELS[tf]}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1" data-feature="chart.interval.custom">
              <Input
                type="number"
                min={1}
                max={240}
                placeholder="분"
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
                className="h-8 border-[var(--workspace-border)] bg-[var(--workspace-panel)] text-xs"
              />
              <Button
                size="sm"
                className="h-8"
                onClick={() => {
                  const n = Number(customMin);
                  setCustomIntervalMinutes(Number.isFinite(n) && n > 0 ? n : null);
                }}
              >
                적용
              </Button>
              {customIntervalMinutes != null && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setCustomIntervalMinutes(null);
                    setCustomMin("");
                  }}
                >
                  해제
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Button
        size="sm"
        className="h-8 shrink-0 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500"
        data-feature="trade.kiwoom"
        onClick={() => setBrokerOpen(true)}
      >
        매매
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 shrink-0 rounded-lg px-2.5 text-xs text-[var(--workspace-fg)]"
        data-feature="trade.kiwoom.account.panel"
        onClick={() => setAccountOpen(true)}
      >
        계좌
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 shrink-0 rounded-lg px-2.5 text-xs text-[var(--workspace-muted)]"
        data-feature="dom"
        onClick={() => setDomOpen(true)}
      >
        호가
      </Button>

      <BarMenu label={styleLabel} active={chartStyle !== "candle"} feature="chart.type.candles">
        <MenuGroup title="봉 모양">
          {CHART_STYLES.map((s) => (
            <MenuRow
              key={s.id}
              label={s.label}
              active={chartStyle === s.id}
              feature={
                s.feature ??
                (s.id === "candle"
                  ? "chart.type.candles"
                  : s.id === "line"
                    ? "chart.type.line"
                    : s.id === "heikin_ashi"
                      ? "chart.type.heikin_ashi"
                      : undefined)
              }
              onClick={() => setChartStyle(s.id)}
            />
          ))}
        </MenuGroup>
        <MenuGroup title="보이는 기간" feature="chart.range_preset">
          <div className="grid grid-cols-5 gap-1 p-2">
            {(Object.keys(RANGE_PRESET_LABELS) as RangePreset[]).map((rp) => (
              <button
                key={rp}
                type="button"
                onClick={() => setRangePreset(rp)}
                className={cn(
                  "rounded-lg py-2 text-xs",
                  rangePreset === rp
                    ? "bg-[var(--brand-accent)] font-semibold text-[#0b1016]"
                    : "bg-[var(--workspace-elevated)] text-[var(--workspace-muted)]"
                )}
              >
                {RANGE_PRESET_LABELS[rp]}
              </button>
            ))}
          </div>
        </MenuGroup>
        <MenuGroup title="가격 눈금">
          {(
            [
              ["linear", "선형", undefined],
              ["log", "로그", "scale.log"],
              ["percent", "퍼센트", "scale.percent"],
              ["indexed_100", "100 기준", "scale.indexed_100"],
            ] as const
          ).map(([mode, label, feature]) => (
            <MenuRow
              key={mode}
              label={label}
              active={priceScaleMode === mode}
              feature={feature}
              onClick={() => setPriceScaleMode(mode)}
            />
          ))}
        </MenuGroup>
        <MenuGroup title="시간">
          <div className="space-y-2 p-3">
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}
              className="h-8 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] px-2 text-xs"
              data-feature="chart.date_format"
            >
              <option value="mm/dd/yyyy">mm/dd/yyyy</option>
              <option value="yyyy-mm-dd">yyyy-mm-dd</option>
              <option value="dd/mm/yyyy">dd/mm/yyyy</option>
            </select>
            <div className="flex items-center gap-1" data-feature="chart.goto">
              <Input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="h-8 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] text-xs"
              />
              <Button size="sm" className="h-8" onClick={() => setGoToDate(dateInput || null)}>
                이동
              </Button>
              {goToDate && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setGoToDate(null);
                    setDateInput("");
                  }}
                >
                  해제
                </Button>
              )}
            </div>
          </div>
          <ToggleRow
            label="시간외"
            checked={extendedHours}
            onChange={setExtendedHours}
            feature="chart.extended_hours"
          />
          <ToggleRow
            label="봉 마감 카운트"
            checked={showCountdown}
            onChange={setShowCountdown}
            feature="scale.countdown"
          />
        </MenuGroup>
      </BarMenu>

      <BarMenu label="지표" active={indicators.length > 0} feature="indicator.overlay">
        <MenuGroup title="겹쳐 보기">
          {INDICATORS.map((ind) => (
            <ToggleRow
              key={ind.id}
              label={ind.label}
              checked={indicators.includes(ind.id)}
              onChange={() => toggleIndicator(ind.id)}
            />
          ))}
        </MenuGroup>
        <MenuGroup title="템플릿" feature="indicator.template">
          {INDICATOR_TEMPLATES.map((tpl) => (
            <MenuRow key={tpl.id} label={tpl.name} onClick={() => applyIndicatorTemplate(tpl.id)} />
          ))}
        </MenuGroup>
        <MenuGroup title="더 보기">
          <MenuRow label="지표 검색" feature="indicator.dialog" onClick={() => setIndicatorDialogOpen(true)} />
          <MenuRow label="커스텀 스크립트" feature="indicator.custom_js" onClick={() => setCustomIndicatorOpen(true)} />
        </MenuGroup>
      </BarMenu>

      <BarMenu label={drawingTool === "none" ? "그리기" : drawLabel} active={drawingTool !== "none"}>
        {favoriteTools.length > 0 && (
          <MenuGroup title="즐겨찾기" feature="draw.favorites">
            {favoriteTools.map((id) => {
              const meta = DRAWING_TOOL_META.find((m) => m.id === id);
              if (!meta) return null;
              return (
                <MenuRow
                  key={meta.id}
                  label={meta.label}
                  hint={meta.hint}
                  active={drawingTool === meta.id}
                  feature={meta.featureId}
                  onClick={() =>
                    setDrawingTool(drawingTool === meta.id ? "none" : (meta.id as DrawingTool))
                  }
                />
              );
            })}
          </MenuGroup>
        )}
        {DRAW_GROUPS.map((group) => (
          <MenuGroup key={group.title} title={group.title}>
            {group.ids.map((id) => {
              const meta = DRAWING_TOOL_META.find((m) => m.id === id);
              if (!meta) return null;
              const Icon = DRAWING_ICONS[meta.id];
              const fav = favoriteTools.includes(meta.id);
              const on = drawingTool === meta.id;
              return (
                <div
                  key={meta.id}
                  className={cn(
                    "flex items-center border-b border-[var(--workspace-border)]/60 last:border-b-0",
                    on && "bg-[var(--brand-accent)]/12"
                  )}
                >
                  <button
                    type="button"
                    data-feature={meta.featureId}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left"
                    onClick={() =>
                      setDrawingTool(on ? "none" : (meta.id as DrawingTool))
                    }
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--workspace-faint)]" />
                    <span className="min-w-0">
                      <span className="block text-[13px] text-[var(--workspace-fg)]">{meta.label}</span>
                      <span className="block text-[11px] text-[var(--workspace-faint)]">{meta.hint}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    title="즐겨찾기"
                    className={cn(
                      "mr-2 rounded-md p-1.5",
                      fav ? "text-amber-300" : "text-[var(--workspace-faint)]"
                    )}
                    onClick={() => toggleFavoriteTool(meta.id)}
                  >
                    <Star className={cn("h-3.5 w-3.5", fav && "fill-current")} />
                  </button>
                </div>
              );
            })}
          </MenuGroup>
        ))}
        <MenuGroup title="도구">
          <ToggleRow
            label="연속 그리기"
            checked={stayInDrawMode}
            onChange={setStayInDrawMode}
            feature="draw.stay_in_mode"
          />
          <ToggleRow label="자석" checked={magnet} onChange={setMagnet} feature="draw.magnet.weak" />
          <ToggleRow
            label="드로잉 잠금"
            checked={drawingsLocked}
            onChange={setDrawingsLocked}
            feature="draw.lock_all"
          />
          <MenuRow
            label="실행 취소"
            feature="chart.undo"
            disabled={!undoStack.length}
            onClick={() => {
              undoDrawings();
              syncDrawings();
            }}
            trailing={<Undo2 className="h-4 w-4 text-[var(--workspace-faint)]" />}
          />
          <MenuRow
            label="다시 실행"
            disabled={!redoStack.length}
            onClick={() => {
              redoDrawings();
              syncDrawings();
            }}
            trailing={<Redo2 className="h-4 w-4 text-[var(--workspace-faint)]" />}
          />
        </MenuGroup>
      </BarMenu>

      <BarMenu label="분석" active={entrySignalsEnabled || easyOverlayEnabled}>
        <MenuGroup title="진입">
          <ToggleRow
            label="진입시그널"
            checked={entrySignalsEnabled}
            onChange={setEntrySignalsEnabled}
            feature="signal.entry.auto"
          />
        </MenuGroup>
        <MenuGroup title="패턴" feature="easychart.pattern_overlay">
          <ToggleRow label="패턴 오버레이" checked={easyOverlayEnabled} onChange={setEasyOverlayEnabled} />
          {(
            [
              ["ob", "오더블록"],
              ["fvg", "FVG"],
              ["confluence", "컨플루언스"],
              ["trend", "추세선"],
              ["channel", "채널"],
              ["fakeout", "스윕"],
              ["srFlip", "지지·저항"],
              ["fib", "피보나치"],
              ["sma365", "365일선"],
              ["overlapOnly", "겹침만"],
              ["halfTpLabel", "반익 표시"],
            ] as const
          ).map(([key, label]) => (
            <ToggleRow
              key={key}
              label={label}
              checked={easyOverlayToggles[key]}
              disabled={!easyOverlayEnabled}
              onChange={(v) => setEasyOverlayToggle(key, v)}
            />
          ))}
          <div className="px-3 py-2">
            <select
              value={easyOverlayPreset}
              disabled={!easyOverlayEnabled}
              onChange={(e) => {
                const p = e.target.value as "scalp" | "swing";
                setEasyOverlayPreset(p);
                if (p === "scalp") setTimeframe("15");
                else setTimeframe("240");
              }}
              className="h-8 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] px-2 text-xs disabled:opacity-40"
            >
              <option value="scalp">단타 프리셋</option>
              <option value="swing">스윙 프리셋</option>
            </select>
          </div>
        </MenuGroup>
      </BarMenu>

      <BarMenu label="화면" active={layoutMode !== "single" || replayActive} feature="layout.mode">
        <MenuGroup title="분할">
          {(
            [
              ["single", "한 화면", Square, "layout.mode.single"],
              ["split2", "둘로 나누기", Columns2, "layout.mode.split2"],
              ["split4", "넷으로 나누기", LayoutGrid, "layout.mode.split4"],
            ] as const
          ).map(([mode, label, Icon, feature]) => (
            <MenuRow
              key={mode}
              label={label}
              active={layoutMode === mode}
              feature={feature}
              onClick={() => setLayoutMode(mode)}
              trailing={<Icon className="h-4 w-4 text-[var(--workspace-faint)]" />}
            />
          ))}
          <MenuRow
            label="전체 화면"
            onClick={() => setFullscreen(true)}
            trailing={<Maximize2 className="h-4 w-4 text-[var(--workspace-faint)]" />}
          />
        </MenuGroup>
        <MenuGroup title="여러 차트 맞추기" feature="draw.sync.layout">
          {(
            [
              ["symbol", "종목", "layout.sync.symbol"],
              ["interval", "시간", "layout.sync.interval"],
              ["crosshair", "십자선", "layout.sync.crosshair"],
              ["drawings", "드로잉", "layout.sync.drawings"],
            ] as const
          ).map(([key, label, feature]) => (
            <ToggleRow
              key={key}
              label={label}
              checked={sync[key]}
              feature={feature}
              onChange={(v) => setSync({ [key]: v })}
            />
          ))}
        </MenuGroup>
        <MenuGroup title="비교" feature="symbol.compare">
          <MenuRow label="비교 끄기" active={compareSymbolId == null} onClick={() => setCompareSymbolId(null)} />
          <div className="max-h-40 overflow-auto">
            {symbols
              .filter((s) => s.id !== activeSymbolId)
              .map((s) => (
                <MenuRow
                  key={s.id}
                  label={`${s.ticker} · ${s.nameKo}`}
                  active={compareSymbolId === s.id}
                  onClick={() => setCompareSymbolId(s.id)}
                />
              ))}
          </div>
        </MenuGroup>
        <MenuGroup title="레이아웃" feature="layout.save">
          <MenuRow
            label="현재 화면 저장"
            onClick={() => {
              const name = window.prompt("레이아웃 이름", `${active?.ticker ?? "chart"} ${timeframe}`);
              if (name?.trim()) saveLayout(name.trim());
            }}
          />
          {layouts.map((l) => (
            <div
              key={l.id}
              className="flex items-center border-b border-[var(--workspace-border)]/60 last:border-b-0"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-[13px] text-[var(--workspace-fg)]"
                onClick={() => loadLayout(l.id)}
              >
                {l.name}
              </button>
              <button
                type="button"
                className="px-3 text-[11px] text-rose-300"
                onClick={() => deleteLayout(l.id)}
              >
                삭제
              </button>
            </div>
          ))}
        </MenuGroup>
        <MenuGroup title="리플레이" feature="replay">
          <MenuRow
            label={replayActive ? "리플레이 끄기" : "리플레이"}
            active={replayActive}
            onClick={() => setReplayActive(!replayActive)}
            trailing={
              replayActive ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 text-[var(--workspace-faint)]" />
              )
            }
          />
          {replayActive && (
            <div className="px-3 py-2">
              <input
                type="range"
                min={0}
                max={Math.max(replayTotalBars - 1, 1)}
                value={replayIndex ?? 0}
                onChange={(e) => setReplayIndex(Number(e.target.value))}
                className="w-full"
              />
            </div>
          )}
          <MenuRow
            label="스냅샷"
            feature="chart.snapshot"
            onClick={() => requestSnapshot()}
            trailing={<Camera className="h-4 w-4 text-[var(--workspace-faint)]" />}
          />
        </MenuGroup>
      </BarMenu>

      <BarMenu label="리서치">
        <MenuGroup title="시장">
          <MenuRow label="스크리너" feature="screener.stock" onClick={() => setScreenerOpen(true)} />
          <MenuRow label="히트맵" feature="heatmap" onClick={() => setHeatmapOpen(true)} />
          <MenuRow label="시즈널" feature="chart.seasonals" onClick={() => setSeasonalsOpen(true)} />
          <MenuRow label="옵션" feature="options.chain" onClick={() => setOptionsOpen(true)} />
          <MenuRow label="금리" feature="yield_curves" onClick={() => setYieldOpen(true)} />
          <MenuRow label="매크로" feature="macro.maps" onClick={() => setMacroOpen(true)} />
        </MenuGroup>
        <MenuGroup title="계좌">
          <MenuRow label="모의장부" feature="trade.paper" onClick={() => setPaperOpen(true)} />
          <MenuRow label="펀드" feature="fund.graphs" onClick={() => setFundGraphsOpen(true)} />
          <MenuRow label="포트폴리오" feature="portfolio" onClick={() => setPortfolioOpen(true)} />
        </MenuGroup>
      </BarMenu>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg border-[var(--workspace-border)] text-xs"
          onClick={onOpenIngest}
        >
          인제스트
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="relative h-8 w-8 rounded-lg p-0"
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
        <Popover open={objectTreeOpen} onOpenChange={setObjectTreeOpen}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 rounded-lg p-0"
                title="드로잉 목록"
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
              <div className="px-1 py-4 text-center text-xs text-[var(--workspace-muted)]">오브젝트 없음</div>
            )}
            {localDrawings.map((d) => (
              <div
                key={d.id}
                className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--workspace-panel)]"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                <div className="min-w-0 flex-1 text-xs text-[var(--workspace-fg)]">
                  <div className="font-medium capitalize">{d.tool}</div>
                  <div className="truncate text-[10px] text-[var(--workspace-faint)]">
                    {d.text?.trim() || d.points.map((p) => p.price.toFixed(1)).join(" → ")}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-[10px] text-rose-300 disabled:opacity-40"
                  disabled={drawingsLocked || d.locked}
                  onClick={() => persistLocal(localDrawings.filter((x) => x.id !== d.id))}
                >
                  삭제
                </button>
              </div>
            ))}
          </PopoverContent>
        </Popover>
        <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 rounded-lg p-0"
                data-feature="chart.settings"
                title="차트 설정"
              />
            }
          >
            <Settings className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent className="w-64 border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-3">
            <div className="mb-2 text-xs font-semibold text-[var(--workspace-fg)]">차트 설정</div>
            <label className="mb-2 flex items-center justify-between text-[11px] text-[var(--workspace-muted)]">
              그리드
              <input
                type="checkbox"
                checked={chartSettings.showGrid}
                onChange={(e) => setChartSettings({ showGrid: e.target.checked })}
              />
            </label>
            <label className="mb-2 flex items-center justify-between text-[11px] text-[var(--workspace-muted)]">
              워터마크
              <input
                type="checkbox"
                checked={chartSettings.showWatermark}
                onChange={(e) => setChartSettings({ showWatermark: e.target.checked })}
              />
            </label>
            <input
              value={chartSettings.watermark}
              onChange={(e) => setChartSettings({ watermark: e.target.value })}
              className="mb-2 h-8 w-full rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-2 text-[11px]"
              data-feature="chart.canvas"
            />
            <div className="mb-2 text-[10px] text-[var(--workspace-faint)]">이벤트 마커</div>
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
                  onChange={(e) => setChartSettings({ [key]: e.target.value })}
                  className="h-6 w-10 cursor-pointer border-0 bg-transparent"
                />
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 rounded-lg p-0"
          data-feature="shell.command_palette"
          onClick={() => setCommandPaletteOpen(true)}
          title="Ctrl+K"
        >
          <Command className="h-4 w-4" />
        </Button>
      </div>
      <KiwoomAccountDialog open={accountOpen} onOpenChange={setAccountOpen} symbols={symbols} />
    </header>
  );
}
