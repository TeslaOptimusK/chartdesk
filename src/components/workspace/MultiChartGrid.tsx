"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LayoutMode } from "@/lib/store";
import { cn } from "@/lib/utils";

interface MultiChartGridProps {
  mode: LayoutMode;
  children: ReactNode[];
  className?: string;
}

/**
 * TradingView-like multi-pane grid with draggable gutters.
 * split2 = side-by-side; split4 = 2×2.
 */
export function MultiChartGrid({
  mode,
  children,
  className,
}: MultiChartGridProps) {
  const [colPct, setColPct] = useState(50);
  const [rowPct, setRowPct] = useState(50);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragKind = useRef<"col" | "row" | null>(null);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const el = wrapRef.current;
    if (!el || !dragKind.current) return;
    const rect = el.getBoundingClientRect();
    if (dragKind.current === "col") {
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setColPct(Math.min(78, Math.max(22, pct)));
    } else {
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setRowPct(Math.min(78, Math.max(22, pct)));
    }
  }, []);

  const endDrag = useCallback(() => {
    dragKind.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [onPointerMove]);

  const startDrag = (kind: "col" | "row") => (e: ReactPointerEvent) => {
    e.preventDefault();
    dragKind.current = kind;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
  };

  const VSep = (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={startDrag("col")}
      className="w-1 shrink-0 cursor-col-resize bg-[var(--workspace-border)] hover:bg-[var(--brand-accent)]/70"
    />
  );

  const HSep = (
    <div
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={startDrag("row")}
      className="h-1 shrink-0 cursor-row-resize bg-[var(--workspace-border)] hover:bg-[var(--brand-accent)]/70"
    />
  );

  if (mode === "single") {
    return (
      <div
        ref={wrapRef}
        className={cn("flex h-full min-h-0 flex-col", className)}
        data-feature="layout.grid"
        data-layout-mode="single"
      >
        <div className="min-h-0 flex-1 overflow-hidden">{children[0]}</div>
      </div>
    );
  }

  if (mode === "split2") {
    return (
      <div
        ref={wrapRef}
        className={cn("flex h-full min-h-0", className)}
        data-feature="layout.grid"
        data-layout-mode="split2"
      >
        <div
          className="min-h-0 min-w-0 overflow-hidden"
          style={{ width: `${colPct}%` }}
        >
          {children[0]}
        </div>
        {VSep}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {children[1]}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={cn("flex h-full min-h-0 flex-col", className)}
      data-feature="layout.grid"
      data-layout-mode="split4"
    >
      <div
        className="flex min-h-0 min-w-0 overflow-hidden"
        style={{ height: `${rowPct}%` }}
      >
        <div
          className="min-h-0 min-w-0 overflow-hidden"
          style={{ width: `${colPct}%` }}
        >
          {children[0]}
        </div>
        {VSep}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {children[1]}
        </div>
      </div>
      {HSep}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          className="min-h-0 min-w-0 overflow-hidden"
          style={{ width: `${colPct}%` }}
        >
          {children[2]}
        </div>
        {VSep}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {children[3]}
        </div>
      </div>
    </div>
  );
}
