"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWorkspace } from "@/lib/store";
import {
  TIMEZONE_OPTIONS,
  extendedSessionBadge,
  getSessionStatus,
  timezoneDisplay,
} from "@/lib/session";

/** Owns the one-second clock so the charts and panels above do not re-render with it. */
export function WorkspaceFooter() {
  const { exchange, extendedHours, timezone, setTimezone, magnet, drawingsLocked } =
    useWorkspace(
      useShallow((s) => ({
        exchange: s.symbols.find((symbol) => symbol.id === s.activeSymbolId)?.exchange,
        extendedHours: s.extendedHours,
        timezone: s.timezone,
        setTimezone: s.setTimezone,
        magnet: s.magnet,
        drawingsLocked: s.drawingsLocked,
      }))
    );
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const session = useMemo(() => getSessionStatus(exchange, clock), [exchange, clock]);
  const extBadge = useMemo(
    () => extendedSessionBadge(exchange, extendedHours, clock),
    [exchange, extendedHours, clock]
  );
  const tzNow = clock.toLocaleString("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
  });

  return (
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
      <span className="flex flex-wrap items-center gap-3">
        <span>
          Ctrl+Z 실행취소 · Y 수평레이 · L 잠금 · A 알림 · O 오브젝트
        </span>
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--workspace-muted)] underline-offset-2 hover:text-[var(--workspace-fg)] hover:underline"
          title="Charts powered by TradingView Lightweight Charts"
        >
          Charts by TradingView
        </a>
      </span>
    </footer>
  );
}
