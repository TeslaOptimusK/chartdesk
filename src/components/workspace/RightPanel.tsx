"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorkspace, type RightTab } from "@/lib/store";
import {
  detectAutoChartPatterns,
  detectCandlestickPatterns,
} from "@/lib/phase2-data";
import {
  CATEGORY_LABELS,
  DIRECTION_LABELS,
  type PostCategory,
  type PriceWatchOp,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { PublishPostForm } from "@/components/workspace/Phase3Panels";
import type { MultiAlertCondition, MultiAlertLogic } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Feature ID: shell.brand — tab order fixed */
const TABS: { id: RightTab; label: string }[] = [
  { id: "watchlist", label: "워치리스트" },
  { id: "news", label: "뉴스" },
  { id: "recent", label: "최근" },
  { id: "patterns", label: "패턴" },
  { id: "posts", label: "포스트" },
  { id: "alerts", label: "알림" },
  { id: "commentary", label: "코멘터리" },
];

export function RightPanel() {
  const { rightTab, setRightTab } = useWorkspace();

  return (
    <aside
      className="flex h-full w-full flex-col border-l border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
      data-feature="shell.brand"
    >
      <div className="flex border-b border-[var(--workspace-border)]">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setRightTab(id)}
            className={cn(
              "flex-1 px-0.5 py-2 text-[9px] font-medium leading-tight",
              rightTab === id
                ? "border-b-2 border-[var(--brand-accent)] text-[var(--workspace-fg)]"
                : "text-[var(--workspace-muted)] hover:text-[var(--workspace-fg)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ScrollArea className="flex-1">
        {rightTab === "watchlist" && <WatchlistTab />}
        {rightTab === "news" && <NewsTab />}
        {rightTab === "recent" && <RecentTab />}
        {rightTab === "patterns" && <PatternsTab />}
        {rightTab === "posts" && <PostsTab />}
        {rightTab === "alerts" && <AlertsTab />}
        {rightTab === "commentary" && <CommentaryTab />}
      </ScrollArea>
    </aside>
  );
}

function WatchlistTab() {
  const {
    symbols,
    watchlist,
    activeSymbolId,
    setActiveSymbol,
    setWatchlist,
    setSecondarySymbols,
  } = useWorkspace();

  const toggle = async (id: string) => {
    const next = watchlist.includes(id)
      ? watchlist.filter((x) => x !== id)
      : [...watchlist, id];
    setWatchlist(next);
    setSecondarySymbols(next.filter((x) => x !== activeSymbolId).slice(0, 3));
    await fetch("/api/symbols", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchlist: next }),
    });
  };

  return (
    <div className="space-y-1 p-2" data-feature="watchlist">
      {symbols.map((s) => {
        const on = watchlist.includes(s.id);
        return (
          <div
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5",
              activeSymbolId === s.id && "bg-[var(--workspace-elevated)]"
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setActiveSymbol(s.id)}
            >
              <div className="truncate text-sm font-medium text-[var(--workspace-fg)]">
                {s.ticker}
              </div>
              <div className="truncate text-[10px] text-[var(--workspace-muted)]">
                {s.nameKo} · {s.exchange}
              </div>
            </button>
            <button
              type="button"
              className={cn(
                "text-xs",
                on ? "text-amber-300" : "text-[var(--workspace-faint)]"
              )}
              onClick={() => toggle(s.id)}
              title="워치리스트"
            >
              {on ? "★" : "☆"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function NewsTab() {
  const { news, setActiveSymbol, calendarEvents } = useWorkspace();
  const eco = calendarEvents.filter((e) => e.kind === "eco");
  const earn = calendarEvents.filter((e) => e.kind === "earnings");
  return (
    <div className="space-y-2 p-2" data-feature="news">
      <div data-feature="calendar.eco">
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase text-[var(--workspace-faint)]">
          경제 캘린더
        </div>
        {eco.map((e) => (
          <div
            key={e.id}
            className="mb-1 rounded border border-[var(--workspace-border)] px-2 py-1.5 text-[11px]"
          >
            <div className="text-[var(--workspace-fg)]">{e.title}</div>
            <div className="text-[10px] text-[var(--workspace-faint)]">
              {new Date(e.at).toLocaleString()} · {e.impact}
            </div>
          </div>
        ))}
      </div>
      <div data-feature="calendar.earnings">
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase text-[var(--workspace-faint)]">
          실적 캘린더
        </div>
        {earn.map((e) => (
          <button
            key={e.id}
            type="button"
            className="mb-1 w-full rounded border border-[var(--workspace-border)] px-2 py-1.5 text-left text-[11px]"
            onClick={() => e.symbolId && setActiveSymbol(e.symbolId)}
          >
            <div className="text-[var(--workspace-fg)]">{e.title}</div>
            <div className="text-[10px] text-[var(--workspace-faint)]">
              {new Date(e.at).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
      {news.length === 0 && <Empty>뉴스가 없습니다.</Empty>}
      {news.map((n) => (
        <button
          key={n.id}
          type="button"
          className="w-full rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2 text-left"
          onClick={() => n.symbolId && setActiveSymbol(n.symbolId)}
        >
          <div className="text-sm font-medium text-[var(--workspace-fg)]">
            {n.title}
          </div>
          <div className="mt-1 text-[11px] text-[var(--workspace-muted)]">
            {n.summary}
          </div>
          <div className="mt-1 text-[10px] text-[var(--workspace-faint)]">
            {n.source} · {new Date(n.publishedAt).toLocaleString()}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Feature ID: symbol.recent */
function RecentTab() {
  const { recentSymbolIds, symbols, setActiveSymbol, activeSymbolId } =
    useWorkspace();
  const items = recentSymbolIds
    .map((id) => symbols.find((s) => s.id === id))
    .filter(Boolean);

  return (
    <div className="space-y-1 p-2" data-feature="symbol.recent">
      {items.length === 0 && <Empty>최근 본 심볼이 없습니다.</Empty>}
      {items.map((s) =>
        s ? (
          <button
            key={s.id}
            type="button"
            className={cn(
              "flex w-full flex-col rounded-md px-2 py-1.5 text-left",
              activeSymbolId === s.id && "bg-[var(--workspace-elevated)]"
            )}
            onClick={() => setActiveSymbol(s.id)}
          >
            <span className="text-sm font-medium text-[var(--workspace-fg)]">
              {s.ticker}
            </span>
            <span className="text-[10px] text-[var(--workspace-muted)]">
              {s.nameKo} · {s.exchange}
            </span>
          </button>
        ) : null
      )}
    </div>
  );
}

function PatternsTab() {
  const {
    patterns,
    patternHits,
    setPatterns,
    setActiveSymbol,
    setTimeframe,
    activeSymbolId,
    timeframe,
  } = useWorkspace();
  const [candlePatterns, setCandlePatterns] = useState<
    { time: number; label: string }[]
  >([]);
  const [autoPatterns, setAutoPatterns] = useState<
    { from: number; to: number; label: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/candles?symbolId=${activeSymbolId}&tf=${timeframe}&limit=120`
    )
      .then((r) => r.json())
      .then((data: { candles: { time: number; open: number; high: number; low: number; close: number }[] }) => {
        if (cancelled) return;
        const c = data.candles ?? [];
        setCandlePatterns(detectCandlestickPatterns(c));
        setAutoPatterns(detectAutoChartPatterns(c));
      })
      .catch(() => {
        if (!cancelled) {
          setCandlePatterns([]);
          setAutoPatterns([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeSymbolId, timeframe]);

  const toggle = async (id: string, enabled: boolean) => {
    const res = await fetch("/api/patterns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    const data = await res.json();
    if (data.pattern) {
      setPatterns(
        patterns.map((p) => (p.id === data.pattern.id ? data.pattern : p))
      );
    }
  };

  return (
    <div className="space-y-3 p-2">
      <div data-feature="pattern.candlestick">
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase text-[var(--workspace-faint)]">
          캔들 패턴
        </div>
        {candlePatterns.length === 0 && (
          <Empty>감지된 캔들 패턴 없음</Empty>
        )}
        {candlePatterns.map((p) => (
          <div
            key={`${p.time}-${p.label}`}
            className="mb-1 rounded border border-[var(--workspace-border)] px-2 py-1 text-xs"
          >
            {p.label} · {new Date(p.time * 1000).toLocaleDateString()}
          </div>
        ))}
      </div>
      <div data-feature="pattern.auto_chart">
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase text-[var(--workspace-faint)]">
          자동 차트 패턴
        </div>
        {autoPatterns.length === 0 && <Empty>구조 패턴 없음</Empty>}
        {autoPatterns.map((p) => (
          <div
            key={`${p.from}-${p.label}`}
            className="mb-1 rounded border border-[var(--workspace-border)] px-2 py-1 text-xs"
          >
            {p.label}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {patterns.map((p) => (
          <div
            key={p.id}
            className="rounded-md border border-[var(--workspace-border)] p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-[var(--workspace-fg)]">
                  {p.name}
                </div>
                <div className="text-[10px] text-[var(--workspace-muted)]">
                  {p.description}
                </div>
              </div>
              <Switch
                checked={p.enabled}
                onCheckedChange={(v) => toggle(p.id, v)}
              />
            </div>
            {p.dsl && (
              <code className="mt-1.5 block rounded bg-black/30 px-1.5 py-1 text-[10px] text-[var(--brand-accent)]">
                {p.dsl}
              </code>
            )}
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--workspace-faint)]">
          최근 히트
        </div>
        {patternHits.length === 0 && <Empty>히트 없음</Empty>}
        {patternHits.slice(0, 12).map((h) => (
          <button
            key={h.id}
            type="button"
            className="mb-1 w-full rounded-md border border-[var(--workspace-border)] px-2 py-1.5 text-left"
            onClick={() => {
              setActiveSymbol(h.symbolId);
              setTimeframe(h.timeframe);
            }}
          >
            <div className="text-xs text-[var(--workspace-fg)]">{h.label}</div>
            <div className="text-[10px] text-[var(--workspace-faint)]">
              score {h.score.toFixed(2)} · {h.timeframe}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PostsTab() {
  const { posts, setActiveSymbol, setRightTab } = useWorkspace();
  const byCat = (Object.keys(CATEGORY_LABELS) as PostCategory[]).map((cat) => ({
    cat,
    items: posts.filter((p) => p.category === cat),
  }));

  return (
    <div className="space-y-3 p-2" data-feature="social.posts">
      <PublishPostForm onPublished={() => undefined} />
      {byCat.map(({ cat, items }) => {
        if (!items.length) return null;
        return (
          <div key={cat}>
            <div className="mb-1 px-1 text-[10px] font-semibold text-[var(--workspace-faint)]">
              {CATEGORY_LABELS[cat]}
            </div>
            {items.map((p) => (
              <button
                key={p.id}
                type="button"
                className="mb-1 w-full rounded-md border border-[var(--workspace-border)] p-2 text-left"
                onClick={() => {
                  if (p.symbolIds[0]) setActiveSymbol(p.symbolIds[0]);
                  setRightTab("commentary");
                }}
              >
                <div className="text-sm text-[var(--workspace-fg)]">{p.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-[var(--workspace-muted)]">
                  {p.body}
                </div>
                <div className="mt-1 text-[10px] text-[var(--workspace-faint)]">
                  {p.ingestMethod} · 원문은 멤버십 계정으로만
                </div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Feature IDs: alert.price, alert.price.*, alert.message */
function AlertsTab() {
  const {
    alerts,
    setAlerts,
    setActiveSymbol,
    setRightTab,
    activeSymbolId,
    symbols,
    priceWatches,
    setPriceWatches,
    watchlist,
    drawings,
    indicators,
    technicalAlerts,
    setTechnicalAlerts,
    webhookConfig,
    setWebhookConfig,
    multiConditionAlerts,
    setMultiConditionAlerts,
  } = useWorkspace();
  const [price, setPrice] = useState("");
  const [op, setOp] = useState<PriceWatchOp>("above");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [techTarget, setTechTarget] = useState("");
  const [techKind, setTechKind] = useState<"drawing" | "indicator">("drawing");

  const localDrawings = useMemo(
    () => drawings.filter((d) => d.symbolId === activeSymbolId),
    [drawings, activeSymbolId]
  );

  const [multiLogic, setMultiLogic] = useState<MultiAlertLogic>("and");
  const [condA, setCondA] = useState<MultiAlertCondition>({
    kind: "price",
    op: "above",
    threshold: 0,
  });
  const [condB, setCondB] = useState<MultiAlertCondition>({
    kind: "indicator",
    op: "below",
    threshold: 30,
    indicatorId: "rsi",
  });
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkOp, setBulkOp] = useState<PriceWatchOp>("above");

  useEffect(() => {
    fetch("/api/multi-alerts")
      .then((r) => r.json())
      .then((d) => {
        if (d.multiConditionAlerts) setMultiConditionAlerts(d.multiConditionAlerts);
      })
      .catch(() => undefined);
    fetch("/api/technical-alerts")
      .then((r) => r.json())
      .then((d) => {
        if (d.technicalAlerts) setTechnicalAlerts(d.technicalAlerts);
      })
      .catch(() => undefined);
    fetch("/api/webhooks")
      .then((r) => r.json())
      .then((d) => {
        if (d.webhookConfig) setWebhookConfig(d.webhookConfig);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAll = async () => {
    const res = await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    const data = await res.json();
    setAlerts(data.alerts ?? []);
  };

  const createWatch = async () => {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbolId: activeSymbolId,
          price: n,
          op,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.priceWatch) {
        setPriceWatches([data.priceWatch, ...priceWatches]);
        setPrice("");
        setMessage("");
      }
    } finally {
      setSaving(false);
    }
  };

  const removeWatch = async (id: string) => {
    const next = priceWatches.filter((x) => x.id !== id);
    setPriceWatches(next);
    await fetch("/api/watches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceWatches: next }),
    });
  };

  const active = symbols.find((s) => s.id === activeSymbolId);
  const opLabel = (o: PriceWatchOp) =>
    o === "above" ? "이상" : o === "below" ? "이하" : "돌파";

  const createTechnical = async () => {
    if (!techTarget.trim()) return;
    const res = await fetch("/api/technical-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: techKind,
        symbolId: activeSymbolId,
        targetId: techTarget.trim(),
        label: techTarget.trim(),
        message: message.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (data.technicalAlert) {
      setTechnicalAlerts([data.technicalAlert, ...technicalAlerts]);
      setTechTarget("");
      setMessage("");
    }
  };

  const saveWebhook = () => {
    void fetch("/api/webhooks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookConfig),
    });
  };

  const createWatchlistBulk = async () => {
    const n = Number(bulkPrice);
    if (!Number.isFinite(n) || n <= 0 || !watchlist.length) return;
    const res = await fetch("/api/watches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        watchlistBulk: true,
        symbolIds: watchlist,
        price: n,
        bulkOp,
        bulkMessage: "워치리스트 일괄",
      }),
    });
    const data = await res.json();
    if (data.priceWatches) {
      setPriceWatches([...data.priceWatches, ...priceWatches]);
      setBulkPrice("");
    }
  };

  const createMultiAlert = async () => {
    const res = await fetch("/api/multi-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbolId: activeSymbolId,
        logic: multiLogic,
        conditions: [condA, condB],
        message: message.trim() || undefined,
      }),
    });
    const data = await res.json();
    if (data.multiConditionAlert) {
      setMultiConditionAlerts([
        data.multiConditionAlert,
        ...multiConditionAlerts,
      ]);
    }
  };

  return (
    <div className="space-y-2 p-2" data-feature="alert.price">
      <div
        className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2"
        data-feature="alert.watchlist"
      >
        <div className="mb-1 text-xs font-semibold">워치 일괄 알림</div>
        <div className="flex gap-1">
          <select
            value={bulkOp}
            onChange={(e) => setBulkOp(e.target.value as PriceWatchOp)}
            className="h-8 rounded border px-1 text-xs"
          >
            <option value="above">이상</option>
            <option value="below">이하</option>
            <option value="crossing">돌파</option>
          </select>
          <input
            type="number"
            value={bulkPrice}
            onChange={(e) => setBulkPrice(e.target.value)}
            placeholder="가격"
            className="h-8 min-w-0 flex-1 rounded border px-2 text-xs"
          />
          <Button size="sm" className="h-8 text-xs" onClick={createWatchlistBulk}>
            {watchlist.length}종목
          </Button>
        </div>
      </div>

      <div
        className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2"
        data-feature="alert.multi_condition"
      >
        <div className="mb-1 text-xs font-semibold">멀티조건 알림</div>
        <select
          value={multiLogic}
          onChange={(e) => setMultiLogic(e.target.value as MultiAlertLogic)}
          className="mb-1 h-8 w-full rounded border px-1 text-xs"
        >
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
        <div className="mb-1 text-[10px] text-[var(--workspace-muted)]">
          가격 {condA.op} {condA.threshold} · RSI {condB.op} {condB.threshold}
        </div>
        <div className="flex gap-1">
          <input
            type="number"
            value={condA.threshold}
            onChange={(e) =>
              setCondA({ ...condA, threshold: Number(e.target.value) })
            }
            className="h-8 w-full rounded border px-2 text-xs"
          />
          <input
            type="number"
            value={condB.threshold}
            onChange={(e) =>
              setCondB({ ...condB, threshold: Number(e.target.value) })
            }
            className="h-8 w-full rounded border px-2 text-xs"
          />
        </div>
        <Button size="sm" className="mt-1 h-7 text-xs" onClick={createMultiAlert}>
          등록
        </Button>
        {multiConditionAlerts
          .filter((m) => m.symbolId === activeSymbolId)
          .map((m) => (
            <div key={m.id} className="mt-1 text-[10px] text-[var(--workspace-muted)]">
              {m.logic.toUpperCase()} · {m.conditions.length}조건
            </div>
          ))}
      </div>
      <div
        className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2"
        data-feature="alert.webhook"
      >
        <div className="mb-1 text-xs font-semibold text-[var(--workspace-fg)]">
          웹훅
        </div>
        <label className="mb-1 flex items-center gap-2 text-[11px]">
          <input
            type="checkbox"
            checked={webhookConfig.enabled}
            onChange={(e) =>
              setWebhookConfig({ enabled: e.target.checked })
            }
          />
          활성
        </label>
        <input
          value={webhookConfig.url}
          onChange={(e) => setWebhookConfig({ url: e.target.value })}
          placeholder="https://hooks.example/..."
          className="mb-1 h-8 w-full rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-2 text-xs"
        />
        <Button size="sm" className="h-7 text-xs" onClick={saveWebhook}>
          저장
        </Button>
      </div>

      <div
        className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2"
        data-feature="alert.technical.drawing"
      >
        <div className="mb-1 text-xs font-semibold text-[var(--workspace-fg)]">
          기술 알림 (선 / 지표)
        </div>
        <select
          value={techKind}
          onChange={(e) =>
            setTechKind(e.target.value as "drawing" | "indicator")
          }
          className="mb-1 h-8 w-full rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-1 text-xs"
          data-feature="alert.technical.indicator"
        >
          <option value="drawing">드로잉</option>
          <option value="indicator">지표</option>
        </select>
        <select
          value={techTarget}
          onChange={(e) => setTechTarget(e.target.value)}
          className="mb-1 h-8 w-full rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-1 text-xs"
        >
          <option value="">대상 선택</option>
          {techKind === "drawing"
            ? localDrawings.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.tool} · {d.id.slice(-6)}
                </option>
              ))
            : indicators.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
        </select>
        <Button size="sm" className="h-7 text-xs" onClick={createTechnical}>
          등록
        </Button>
        {technicalAlerts
          .filter((t) => t.symbolId === activeSymbolId)
          .map((t) => (
            <div
              key={t.id}
              className="mt-1 text-[11px] text-[var(--workspace-muted)]"
            >
              {t.kind}: {t.label}
            </div>
          ))}
      </div>

      <div className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
        <div className="mb-1.5 text-xs font-semibold text-[var(--workspace-fg)]">
          가격 알림 · {active?.ticker ?? activeSymbolId}
        </div>
        <div className="flex gap-1">
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as PriceWatchOp)}
            className="h-8 rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-1 text-xs text-[var(--workspace-fg)]"
            data-feature="alert.price.greater_than"
          >
            <option value="above">이상</option>
            <option value="below">이하</option>
            <option value="crossing">돌파</option>
          </select>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="가격"
            className="h-8 min-w-0 flex-1 rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-2 text-xs text-[var(--workspace-fg)]"
          />
          <Button
            size="sm"
            className="h-8 bg-[var(--brand-accent)] px-2 text-xs text-[#0b1016]"
            onClick={createWatch}
            disabled={saving}
          >
            등록
          </Button>
        </div>
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="노트 남김"
          data-feature="alert.message"
          className="mt-1.5 h-8 w-full rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-2 text-xs text-[var(--workspace-fg)]"
        />
        {priceWatches.filter((w) => w.symbolId === activeSymbolId).length >
          0 && (
          <div className="mt-2 space-y-1">
            {priceWatches
              .filter((w) => w.symbolId === activeSymbolId)
              .map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-2 text-[11px] text-[var(--workspace-muted)]"
                >
                  <span className="min-w-0 truncate">
                    {opLabel(w.op)} {w.price}
                    {w.message ? ` · ${w.message}` : ""}
                    {w.triggered ? " · 발화됨" : ""}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-rose-300"
                    onClick={() => removeWatch(w.id)}
                  >
                    삭제
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAll}>
          모두 읽음
        </Button>
      </div>
      {alerts.length === 0 && <Empty>알림이 없습니다.</Empty>}
      {alerts.map((a) => (
        <button
          key={a.id}
          type="button"
          className={cn(
            "w-full rounded-md border border-[var(--workspace-border)] p-2 text-left",
            a.read ? "opacity-60" : "bg-[var(--workspace-elevated)]"
          )}
          onClick={() => {
            if (a.symbolId) setActiveSymbol(a.symbolId);
            if (a.type === "opinion") setRightTab("commentary");
            if (a.type === "pattern") setRightTab("patterns");
          }}
        >
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              {a.type}
            </Badge>
            <span className="text-sm font-medium text-[var(--workspace-fg)]">
              {a.title}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[var(--workspace-muted)]">
            {a.message}
          </div>
          <div className="mt-1 text-[10px] text-[var(--workspace-faint)]">
            {new Date(a.firedAt).toLocaleString()}
          </div>
        </button>
      ))}
    </div>
  );
}

function CommentaryTab() {
  const {
    comments,
    setComments,
    opinions,
    setOpinions,
    activeSymbolId,
    symbols,
    setActiveSymbol,
  } = useWorkspace();
  const [body, setBody] = useState("");
  const active = symbols.find((s) => s.id === activeSymbolId);
  const local = comments.filter((c) => c.symbolId === activeSymbolId);

  const submit = async () => {
    if (!body.trim()) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbolId: activeSymbolId, body: body.trim() }),
    });
    const data = await res.json();
    if (data.comment) {
      setComments([data.comment, ...comments]);
      setBody("");
    }
  };

  const review = async (id: string, status: "approved" | "rejected") => {
    const res = await fetch("/api/opinions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json();
    if (data.opinion) {
      setOpinions(
        opinions.map((o) => (o.id === data.opinion.id ? data.opinion : o))
      );
    }
  };

  return (
    <div className="space-y-3 p-2" data-feature="note">
      <div className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
        <div className="mb-1.5 text-xs font-semibold text-[var(--workspace-fg)]">
          코멘터리 · {active?.ticker ?? activeSymbolId}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="차트에 대한 메모…"
          className="w-full rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-2 py-1.5 text-xs text-[var(--workspace-fg)]"
        />
        <Button
          size="sm"
          className="mt-1.5 h-7 bg-[var(--brand-accent)] text-xs text-[#0b1016]"
          onClick={submit}
        >
          남기기
        </Button>
      </div>
      {local.length === 0 && <Empty>코멘트가 없습니다.</Empty>}
      {local.map((c) => (
        <div
          key={c.id}
          className="rounded-md border border-[var(--workspace-border)] p-2"
        >
          <div className="text-sm text-[var(--workspace-fg)]">{c.body}</div>
          <div className="mt-1 text-[10px] text-[var(--workspace-faint)]">
            {c.author} · {new Date(c.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
      <div>
        <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--workspace-faint)]">
          의견 초안
        </div>
        {opinions.slice(0, 8).map((o) => (
          <div
            key={o.id}
            className="mb-1 rounded-md border border-[var(--workspace-border)] p-2"
          >
            <button
              type="button"
              className="text-left text-sm font-medium text-[var(--workspace-fg)]"
              onClick={() => setActiveSymbol(o.symbolId)}
            >
              {o.summary}
            </button>
            <div className="mt-0.5 text-[10px] text-[var(--workspace-muted)]">
              {DIRECTION_LABELS[o.direction]} · {o.status}
            </div>
            {o.status === "draft" && (
              <div className="mt-1.5 flex gap-1">
                <Button
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => review(o.id, "approved")}
                >
                  승인
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={() => review(o.id, "rejected")}
                >
                  반려
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-6 text-center text-xs text-[var(--workspace-muted)]">
      {children}
    </div>
  );
}
