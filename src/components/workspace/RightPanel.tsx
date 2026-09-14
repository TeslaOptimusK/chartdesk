"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/store";
import {
  CATEGORY_LABELS,
  DIRECTION_LABELS,
  type PostCategory,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function RightPanel() {
  const { rightTab, setRightTab } = useWorkspace();
  const tabs = [
    ["watchlist", "워치"],
    ["opinions", "의견"],
    ["patterns", "패턴"],
    ["posts", "포스트"],
    ["alerts", "알림"],
    ["objects", "오브젝트"],
  ] as const;

  return (
    <aside className="flex h-full w-full flex-col border-l border-[var(--workspace-border)] bg-[var(--workspace-panel)]">
      <div className="flex border-b border-[var(--workspace-border)]">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setRightTab(id)}
            className={cn(
              "flex-1 px-0.5 py-2 text-[10px] font-medium",
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
        {rightTab === "opinions" && <OpinionsTab />}
        {rightTab === "patterns" && <PatternsTab />}
        {rightTab === "posts" && <PostsTab />}
        {rightTab === "alerts" && <AlertsTab />}
        {rightTab === "objects" && <ObjectsTab />}
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
    <div className="space-y-1 p-2">
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
              <div className="truncate text-[11px] text-[var(--workspace-muted)]">
                {s.nameKo} · {s.exchange}
              </div>
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => toggle(s.id)}
            >
              {on ? "★" : "☆"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function OpinionsTab() {
  const {
    opinions,
    symbols,
    posts,
    setActiveSymbol,
    setOpinions,
    setRightTab,
  } = useWorkspace();

  const review = async (id: string, status: "approved" | "rejected") => {
    const res = await fetch("/api/opinions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setOpinions(
      opinions.map((o) => (o.id === id ? data.opinion : o))
    );
  };

  return (
    <div className="space-y-2 p-2">
      <p className="px-1 text-[11px] leading-relaxed text-[var(--workspace-muted)]">
        학습·연구 보조 의견이며 투자 권유가 아닙니다. 초안은 승인 후에만
        게시됩니다.
      </p>
      {opinions.length === 0 && (
        <Empty>의견이 없습니다. 포스트를 인제스트하세요.</Empty>
      )}
      {opinions.map((op) => {
        const sym = symbols.find((s) => s.id === op.symbolId);
        const post = posts.find((p) => p.id === op.sourcePostId);
        return (
          <div
            key={op.id}
            className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2"
          >
            <div className="mb-1 flex items-center gap-1.5">
              <Badge
                className={cn(
                  "text-[10px]",
                  op.direction === "buy" && "bg-emerald-500/20 text-emerald-300",
                  op.direction === "sell" && "bg-rose-500/20 text-rose-300",
                  op.direction === "watch" && "bg-amber-500/20 text-amber-200",
                  op.direction === "unclear" && "bg-slate-500/20 text-slate-300"
                )}
              >
                {DIRECTION_LABELS[op.direction]}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {op.status}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {op.confidence}
              </Badge>
            </div>
            <button
              type="button"
              className="mb-1 text-left text-sm font-medium text-[var(--workspace-fg)] hover:underline"
              onClick={() => {
                setActiveSymbol(op.symbolId);
                setRightTab("opinions");
              }}
            >
              {op.summary}
            </button>
            <ul className="mb-2 space-y-1 text-[11px] text-[var(--workspace-muted)]">
              {op.rationale.slice(0, 3).map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
            {post && (
              <div className="mb-2 text-[10px] text-[var(--workspace-faint)]">
                출처: {CATEGORY_LABELS[post.category]} · {post.title}
              </div>
            )}
            {op.status === "draft" && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="h-7 bg-[var(--brand-accent)] text-[#0b1016] hover:bg-[var(--brand-accent)]/90"
                  onClick={() => review(op.id, "approved")}
                >
                  승인
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => review(op.id, "rejected")}
                >
                  기각
                </Button>
              </div>
            )}
            {sym && (
              <Button
                size="sm"
                variant="link"
                className="h-auto px-0 text-[11px] text-[var(--brand-accent)]"
                onClick={() => setActiveSymbol(sym.id)}
              >
                {sym.ticker} 차트 열기 →
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PatternsTab() {
  const {
    patterns,
    patternHits,
    activeSymbolId,
    timeframe,
    setPatterns,
    setPatternHits,
    setAlerts,
  } = useWorkspace();

  const scan = async () => {
    const res = await fetch("/api/patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "scan",
        symbolId: activeSymbolId,
        timeframe,
      }),
    });
    const data = await res.json();
    setPatternHits(data.hits ?? []);
    const alertsRes = await fetch("/api/alerts");
    const alertsData = await alertsRes.json();
    setAlerts(alertsData.alerts ?? []);
  };

  const toggle = async (id: string, enabled: boolean) => {
    const res = await fetch("/api/patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", patternId: id, enabled }),
    });
    const data = await res.json();
    if (data.pattern) {
      setPatterns(patterns.map((p) => (p.id === id ? data.pattern : p)));
    }
  };

  const feedback = async (hitId: string, value: "correct" | "incorrect") => {
    await fetch("/api/patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "feedback", hitId, feedback: value }),
    });
    setPatternHits(
      patternHits.map((h) =>
        h.id === hitId ? { ...h, feedback: value } : h
      )
    );
  };

  const hits = patternHits.filter((h) => h.symbolId === activeSymbolId);

  return (
    <div className="space-y-3 p-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-[var(--workspace-muted)]">
          시드 패턴 {patterns.length}개
        </span>
        <Button
          size="sm"
          className="h-7 bg-[var(--brand-accent)] text-[#0b1016] hover:bg-[var(--brand-accent)]/90"
          onClick={scan}
        >
          현재 심볼 스캔
        </Button>
      </div>
      {patterns.map((p) => (
        <div
          key={p.id}
          className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2"
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-[var(--workspace-fg)]">
              {p.name}
            </div>
            <Switch
              checked={p.enabled}
              onCheckedChange={(v) => toggle(p.id, Boolean(v))}
            />
          </div>
          <p className="mb-1 text-[11px] text-[var(--workspace-muted)]">
            {p.description}
          </p>
          {p.dsl && (
            <code className="block rounded bg-black/30 px-1.5 py-1 text-[10px] text-[var(--brand-accent)]">
              {p.dsl}
            </code>
          )}
        </div>
      ))}
      <div className="border-t border-[var(--workspace-border)] pt-2">
        <div className="mb-1 px-1 text-xs font-medium text-[var(--workspace-fg)]">
          최근 히트
        </div>
        {hits.length === 0 && <Empty>스캔 결과가 없습니다.</Empty>}
        {hits.map((h) => (
          <div
            key={h.id}
            className="mb-2 rounded-md border border-[var(--workspace-border)] p-2 text-[11px]"
          >
            <div className="font-medium text-[var(--workspace-fg)]">
              {h.label} · score {h.score.toFixed(2)}
            </div>
            <div className="mb-1 text-[var(--workspace-muted)]">
              {new Date(h.fromTs * 1000).toLocaleString()} →{" "}
              {new Date(h.toTs * 1000).toLocaleString()}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => feedback(h.id, "correct")}
              >
                맞음
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => feedback(h.id, "incorrect")}
              >
                틀림
              </Button>
              {h.feedback && (
                <span className="self-center text-[var(--workspace-faint)]">
                  ({h.feedback})
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PostsTab() {
  const { posts, setActiveSymbol, setRightTab } = useWorkspace();
  const categories = Object.keys(CATEGORY_LABELS) as PostCategory[];

  return (
    <div className="space-y-3 p-2">
      {categories.map((cat) => {
        const list = posts.filter((p) => p.category === cat);
        return (
          <div key={cat}>
            <div className="mb-1 px-1 text-xs font-semibold text-[var(--brand-accent)]">
              {CATEGORY_LABELS[cat]}{" "}
              <span className="text-[var(--workspace-faint)]">({list.length})</span>
            </div>
            {list.length === 0 && <Empty>포스트 없음</Empty>}
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                className="mb-1.5 w-full rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2 text-left"
                onClick={() => {
                  if (p.symbolIds[0]) {
                    setActiveSymbol(p.symbolIds[0]);
                    setRightTab("opinions");
                  }
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

function AlertsTab() {
  const {
    alerts,
    setAlerts,
    setActiveSymbol,
    setRightTab,
    activeSymbolId,
    symbols,
    priceWatches,
    addPriceWatch,
    setPriceWatches,
  } = useWorkspace();
  const [price, setPrice] = useState("");
  const [op, setOp] = useState<"above" | "below">("above");

  const markAll = async () => {
    const res = await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    const data = await res.json();
    setAlerts(data.alerts ?? []);
  };

  const createWatch = () => {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return;
    addPriceWatch({ symbolId: activeSymbolId, price: n, op });
    setPrice("");
  };

  const active = symbols.find((s) => s.id === activeSymbolId);

  return (
    <div className="space-y-2 p-2">
      <div className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2">
        <div className="mb-1.5 text-xs font-semibold text-[var(--workspace-fg)]">
          가격 알림 · {active?.ticker ?? activeSymbolId}
        </div>
        <div className="flex gap-1">
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as "above" | "below")}
            className="h-8 rounded border border-[var(--workspace-border)] bg-[var(--workspace-panel)] px-1 text-xs text-[var(--workspace-fg)]"
          >
            <option value="above">이상</option>
            <option value="below">이하</option>
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
          >
            등록
          </Button>
        </div>
        {priceWatches.filter((w) => w.symbolId === activeSymbolId).length >
          0 && (
          <div className="mt-2 space-y-1">
            {priceWatches
              .filter((w) => w.symbolId === activeSymbolId)
              .map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between text-[11px] text-[var(--workspace-muted)]"
                >
                  <span>
                    {w.op === "above" ? "↑" : "↓"} {w.price}
                    {w.triggered ? " · 발화됨" : ""}
                  </span>
                  <button
                    type="button"
                    className="text-rose-300"
                    onClick={() =>
                      setPriceWatches(priceWatches.filter((x) => x.id !== w.id))
                    }
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
            if (a.type === "opinion") setRightTab("opinions");
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

function ObjectsTab() {
  const {
    drawings,
    setDrawings,
    activeSymbolId,
    symbols,
    setActiveSymbol,
  } = useWorkspace();
  const local = drawings.filter((d) => d.symbolId === activeSymbolId);
  const active = symbols.find((s) => s.id === activeSymbolId);

  const remove = async (id: string) => {
    const nextLocal = local.filter((d) => d.id !== id);
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

  const clearAll = async () => {
    const merged = drawings.filter((d) => d.symbolId !== activeSymbolId);
    setDrawings(merged);
    await fetch("/api/drawings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbolId: activeSymbolId, drawings: [] }),
    });
  };

  return (
    <div className="space-y-2 p-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-xs font-semibold text-[var(--workspace-fg)]">
          드로잉 · {active?.ticker ?? activeSymbolId}
        </div>
        {local.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] text-rose-300"
            onClick={clearAll}
          >
            전부 삭제
          </Button>
        )}
      </div>
      {local.length === 0 && <Empty>오브젝트 없음</Empty>}
      {local.map((d) => (
        <div
          key={d.id}
          className="flex items-center gap-2 rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] px-2 py-1.5"
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: d.color }}
          />
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-xs text-[var(--workspace-fg)]"
            onClick={() => setActiveSymbol(d.symbolId)}
          >
            <div className="font-medium capitalize">{d.tool}</div>
            <div className="truncate text-[10px] text-[var(--workspace-faint)]">
              {d.text?.trim() ||
                d.points.map((p) => p.price.toFixed(1)).join(" → ") ||
                d.id}
            </div>
          </button>
          <button
            type="button"
            className="text-[10px] text-rose-300"
            onClick={() => remove(d.id)}
          >
            삭제
          </button>
        </div>
      ))}
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
