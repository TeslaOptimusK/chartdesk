"use client";

import { useEffect, useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useWorkspace, type IndicatorId } from "@/lib/store";
import { INDICATOR_TEMPLATES } from "@/lib/types";

const INDICATOR_CATALOG: { id: IndicatorId; label: string; feature?: string }[] =
  [
    { id: "sma20", label: "SMA 20" },
    { id: "ema9", label: "EMA 9" },
    { id: "ema20", label: "EMA 20" },
    { id: "ema50", label: "EMA 50" },
    { id: "ema200", label: "EMA 200" },
    { id: "wma", label: "WMA" },
    { id: "bb", label: "Bollinger Bands" },
    { id: "ichimoku", label: "Ichimoku" },
    { id: "supertrend", label: "SuperTrend" },
    { id: "vwap", label: "VWAP" },
    { id: "rsi", label: "RSI" },
    { id: "macd", label: "MACD" },
    { id: "stoch", label: "Stochastic" },
    { id: "stochRsi", label: "Stoch RSI" },
    { id: "atr", label: "ATR" },
    { id: "volMa", label: "Volume MA" },
    { id: "volume", label: "Volume" },
  ];

/** Feature ID: shell.command_palette + indicator.dialog */
export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    indicatorDialogOpen,
    setIndicatorDialogOpen,
    toggleIndicator,
    indicators,
    applyIndicatorTemplate,
    setActiveSymbol,
    symbols,
    setTimeframe,
    setChartStyle,
    setDrawingTool,
  } = useWorkspace();

  const open = commandPaletteOpen || indicatorDialogOpen;

  const close = () => {
    setCommandPaletteOpen(false);
    setIndicatorDialogOpen(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
          // allow indicator dialog from inputs only when empty? skip
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          setCommandPaletteOpen(true);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIndicatorDialogOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandPaletteOpen, setIndicatorDialogOpen]);

  const symbolItems = useMemo(() => symbols.slice(0, 40), [symbols]);

  return (
    <div data-feature="shell.command_palette">
    <CommandDialog
      open={open}
      onOpenChange={(v) => (v ? undefined : close())}
      title="빠른 검색"
      description="지표, 심볼, 템플릿"
    >
      <CommandInput placeholder="검색… (지표, 심볼, 템플릿)" />
      <CommandList>
        <CommandEmpty>결과 없음</CommandEmpty>
        <CommandGroup heading="지표" data-feature="indicator.dialog">
          {INDICATOR_CATALOG.map((ind) => (
            <CommandItem
              key={ind.id}
              value={`${ind.label} ${ind.id}`}
              onSelect={() => {
                toggleIndicator(ind.id);
                close();
              }}
            >
              {ind.label}
              {indicators.includes(ind.id) ? " ✓" : ""}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="템플릿" data-feature="indicator.template">
          {INDICATOR_TEMPLATES.map((tpl) => (
            <CommandItem
              key={tpl.id}
              value={tpl.name}
              onSelect={() => {
                applyIndicatorTemplate(tpl.id);
                close();
              }}
            >
              {tpl.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="심볼">
          {symbolItems.map((s) => (
            <CommandItem
              key={s.id}
              value={`${s.ticker} ${s.nameKo} ${s.nameEn}`}
              onSelect={() => {
                setActiveSymbol(s.id);
                close();
              }}
            >
              {s.ticker} · {s.nameKo}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="인터벌">
          {(
            [
              ["1", "1분"],
              ["5", "5분"],
              ["15", "15분"],
              ["60", "1시간"],
              ["D", "일봉"],
            ] as const
          ).map(([tf, label]) => (
            <CommandItem
              key={tf}
              value={`interval ${label}`}
              onSelect={() => {
                setTimeframe(tf);
                close();
              }}
            >
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="차트 타입">
          {(
            [
              ["candle", "캔들"],
              ["hollow_candle", "중공 캔들"],
              ["baseline", "베이스라인"],
              ["area", "에어리어"],
              ["bar", "바"],
              ["renko", "렌코"],
              ["kagi", "카기"],
              ["volume_candles", "볼륨 캔들"],
            ] as const
          ).map(([id, label]) => (
            <CommandItem
              key={id}
              value={label}
              onSelect={() => {
                setChartStyle(id);
                close();
              }}
            >
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="드로잉">
          <CommandItem
            value="draw trend"
            onSelect={() => {
              setDrawingTool("trend");
              close();
            }}
          >
            추세선
          </CommandItem>
          <CommandItem
            value="draw horizontal"
            onSelect={() => {
              setDrawingTool("horizontal");
              close();
            }}
          >
            수평선
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
    </div>
  );
}
