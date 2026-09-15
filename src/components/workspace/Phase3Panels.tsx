"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  filterScreener,
  mockFundamentals,
  mockPortfolio,
  mockSeasonals,
  mockSectorHeatmap,
  mockScreenerRows,
  mockWatchlistHeatmap,
} from "@/lib/phase3-data";
import { CUSTOM_INDICATOR_EXAMPLE } from "@/lib/custom-indicator";
import type {
  MultiAlertCondition,
  PaperOrderSide,
  PaperOrderType,
  PostCategory,
} from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Phase3Panels() {
  const {
    screenerOpen,
    setScreenerOpen,
    heatmapOpen,
    setHeatmapOpen,
    paperOpen,
    setPaperOpen,
    fundGraphsOpen,
    setFundGraphsOpen,
    portfolioOpen,
    setPortfolioOpen,
    seasonalsOpen,
    setSeasonalsOpen,
    customIndicatorOpen,
    setCustomIndicatorOpen,
    symbols,
    watchlist,
    activeSymbolId,
    setActiveSymbol,
    paperAccount,
    setPaperAccount,
    customIndicatorSource,
    setCustomIndicatorSource,
    indicatorOnIndicator,
    setIndicatorOnIndicator,
  } = useWorkspace();

  return (
    <>
      <ScreenerDialog
        open={screenerOpen}
        onOpenChange={setScreenerOpen}
        symbols={symbols}
        onPick={setActiveSymbol}
      />
      <HeatmapDialog
        open={heatmapOpen}
        onOpenChange={setHeatmapOpen}
        symbols={symbols}
        watchlist={watchlist}
        onPick={setActiveSymbol}
      />
      <PaperDialog
        open={paperOpen}
        onOpenChange={setPaperOpen}
        account={paperAccount}
        setAccount={setPaperAccount}
        activeSymbolId={activeSymbolId}
        symbols={symbols}
      />
      <FundGraphsDialog
        open={fundGraphsOpen}
        onOpenChange={setFundGraphsOpen}
        symbolId={activeSymbolId}
      />
      <PortfolioDialog
        open={portfolioOpen}
        onOpenChange={setPortfolioOpen}
        symbols={symbols}
      />
      <SeasonalsDialog
        open={seasonalsOpen}
        onOpenChange={setSeasonalsOpen}
        symbolId={activeSymbolId}
        symbols={symbols}
      />
      <CustomIndicatorDialog
        open={customIndicatorOpen}
        onOpenChange={setCustomIndicatorOpen}
        source={customIndicatorSource}
        setSource={setCustomIndicatorSource}
        indicatorOnIndicator={indicatorOnIndicator}
        setIndicatorOnIndicator={setIndicatorOnIndicator}
      />
    </>
  );
}

function ScreenerDialog({
  open,
  onOpenChange,
  symbols,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbols: ReturnType<typeof useWorkspace.getState>["symbols"];
  onPick: (id: string) => void;
}) {
  const rows = useMemo(() => mockScreenerRows(symbols), [symbols]);
  const [minCap, setMinCap] = useState("");
  const [minChange, setMinChange] = useState("");
  const filtered = filterScreener(rows, {
    minCap: minCap ? Number(minCap) : undefined,
    minChange: minChange ? Number(minChange) : undefined,
  }).slice(0, 40);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-feature="screener.stock">
        <DialogHeader>
          <DialogTitle>주식 스크리너 (mock)</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="최소 시총(Bn)"
            value={minCap}
            onChange={(e) => setMinCap(e.target.value)}
            className="h-8 text-xs"
          />
          <Input
            placeholder="최소 등락%"
            value={minChange}
            onChange={(e) => setMinChange(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          {filtered.map((r) => (
            <button
              key={r.symbolId}
              type="button"
              className="flex w-full items-center justify-between rounded border border-[var(--workspace-border)] px-2 py-1.5 text-left text-xs hover:bg-[var(--workspace-elevated)]"
              onClick={() => {
                onPick(r.symbolId);
                onOpenChange(false);
              }}
            >
              <span>
                {r.ticker} · {r.sector}
              </span>
              <span className={r.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {r.changePct.toFixed(2)}% · cap {r.marketCapBn}Bn
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeatmapDialog({
  open,
  onOpenChange,
  symbols,
  watchlist,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbols: ReturnType<typeof useWorkspace.getState>["symbols"];
  watchlist: string[];
  onPick: (id: string) => void;
}) {
  const sector = useMemo(() => mockSectorHeatmap(symbols), [symbols]);
  const watch = useMemo(
    () => mockWatchlistHeatmap(symbols, watchlist.length ? watchlist : symbols.slice(0, 8).map((s) => s.id)),
    [symbols, watchlist]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-feature="heatmap">
        <DialogHeader>
          <DialogTitle>히트맵 (mock)</DialogTitle>
        </DialogHeader>
        <HeatGrid title="섹터" cells={sector} onPick={(id) => id.startsWith("sec_") ? undefined : onPick(id)} />
        <HeatGrid
          title="워치리스트"
          cells={watch}
          onPick={(id) => {
            onPick(id);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function HeatGrid({
  title,
  cells,
  onPick,
}: {
  title: string;
  cells: { id: string; label: string; changePct: number }[];
  onPick?: (id: string) => void;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold uppercase text-[var(--workspace-faint)]">
        {title}
      </div>
      <div className="flex flex-wrap gap-1">
        {cells.map((c) => (
          <button
            key={c.id}
            type="button"
            className={cn(
              "rounded px-2 py-1 text-[10px] font-medium text-[#0b1016]",
              c.changePct >= 0 ? "bg-emerald-500/80" : "bg-rose-500/80"
            )}
            onClick={() => onPick?.(c.id)}
          >
            {c.label} {c.changePct.toFixed(1)}%
          </button>
        ))}
      </div>
    </div>
  );
}

function PaperDialog({
  open,
  onOpenChange,
  account,
  setAccount,
  activeSymbolId,
  symbols,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: ReturnType<typeof useWorkspace.getState>["paperAccount"];
  setAccount: ReturnType<typeof useWorkspace.getState>["setPaperAccount"];
  activeSymbolId: string;
  symbols: ReturnType<typeof useWorkspace.getState>["symbols"];
}) {
  const [qty, setQty] = useState("10");
  const [side, setSide] = useState<PaperOrderSide>("buy");
  const [type, setType] = useState<PaperOrderType>("market");
  const [limit, setLimit] = useState("");
  const sym = symbols.find((s) => s.id === activeSymbolId);

  const persist = async (next: typeof account) => {
    setAccount(next);
    await fetch("/api/paper", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: next }),
    });
  };

  const submit = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return;
    const mockLast = 100 + (activeSymbolId.length % 50);
    const fill =
      type === "limit" && limit ? Number(limit) : mockLast;
    const res = await fetch("/api/paper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbolId: activeSymbolId,
        side,
        type,
        qty: n,
        limitPrice: type === "limit" ? Number(limit) : undefined,
        mockLast,
      }),
    });
    const data = await res.json();
    if (data.account) setAccount(data.account);
  };

  const equity =
    account.cash +
    account.positions.reduce((a, p) => a + p.qty * p.avgCost, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-feature="trade.paper">
        <DialogHeader>
          <DialogTitle>페이퍼 트레이딩</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-[var(--workspace-muted)]">
          현금 ${account.cash.toFixed(2)} · 추정 자산 ${equity.toFixed(2)}
        </div>
        <div className="flex gap-1">
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as PaperOrderSide)}
            className="h-8 rounded border px-1 text-xs"
          >
            <option value="buy">매수</option>
            <option value="sell">매도</option>
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PaperOrderType)}
            className="h-8 rounded border px-1 text-xs"
          >
            <option value="market">시장가</option>
            <option value="limit">지정가</option>
          </select>
          <Input value={qty} onChange={(e) => setQty(e.target.value)} className="h-8 w-16 text-xs" />
          {type === "limit" && (
            <Input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="가격"
              className="h-8 w-20 text-xs"
            />
          )}
          <Button size="sm" className="h-8 text-xs" onClick={submit}>
            {sym?.ticker ?? activeSymbolId}
          </Button>
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto text-[11px]">
          {account.positions.map((p) => {
            const s = symbols.find((x) => x.id === p.symbolId);
            const last = p.avgCost * 1.02;
            const pnl = (last - p.avgCost) * p.qty;
            return (
              <div key={p.symbolId} className="flex justify-between">
                <span>
                  {s?.ticker ?? p.symbolId} × {p.qty}
                </span>
                <span className={pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  P/L {pnl.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => persist({ ...account, orders: [] })}
        >
          주문 기록 지우기
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function FundGraphsDialog({
  open,
  onOpenChange,
  symbolId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbolId: string;
}) {
  const points = useMemo(() => mockFundamentals(symbolId), [symbolId]);
  const maxRev = Math.max(...points.map((p) => p.revenueBn));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-feature="fund.graphs">
        <DialogHeader>
          <DialogTitle>펀더멘털 (mock)</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {points.map((p) => (
            <div key={p.period} className="text-[11px]">
              <div className="flex justify-between">
                <span>{p.period}</span>
                <span>
                  EPS {p.eps.toFixed(2)} · Rev {p.revenueBn.toFixed(1)}Bn
                </span>
              </div>
              <div className="mt-0.5 h-2 rounded bg-black/30">
                <div
                  className="h-2 rounded bg-sky-500/70"
                  style={{ width: `${(p.revenueBn / maxRev) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PortfolioDialog({
  open,
  onOpenChange,
  symbols,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbols: ReturnType<typeof useWorkspace.getState>["symbols"];
}) {
  const holdings = useMemo(() => mockPortfolio(symbols), [symbols]);
  const total = holdings.reduce(
    (a, h) => a + h.shares * h.last,
    0
  );
  let cum = 100;
  const curve = holdings.map((h, i) => {
    cum += ((h.last - h.avgCost) / h.avgCost) * 8;
    return { i, v: cum };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-feature="portfolio">
        <DialogHeader>
          <DialogTitle>포트폴리오 (mock)</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-[var(--workspace-muted)]">
          총 평가 ${total.toFixed(0)}
        </div>
        <svg viewBox="0 0 200 40" className="h-10 w-full text-sky-400">
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            points={curve.map((p) => `${p.i * (200 / Math.max(curve.length - 1, 1))},${40 - p.v / 4}`).join(" ")}
          />
        </svg>
        {holdings.map((h) => {
          const s = symbols.find((x) => x.id === h.symbolId);
          const pnl = (h.last - h.avgCost) * h.shares;
          return (
            <div key={h.symbolId} className="flex justify-between text-[11px]">
              <span>
                {s?.ticker ?? h.symbolId} · {h.shares}주
              </span>
              <span className={pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {pnl.toFixed(2)}
              </span>
            </div>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}

function SeasonalsDialog({
  open,
  onOpenChange,
  symbolId,
  symbols,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbolId: string;
  symbols: ReturnType<typeof useWorkspace.getState>["symbols"];
}) {
  const months = useMemo(() => mockSeasonals(symbolId), [symbolId]);
  const sym = symbols.find((s) => s.id === symbolId);
  const max = Math.max(...months.map((m) => Math.abs(m.avgReturn)), 0.1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-feature="chart.seasonals">
        <DialogHeader>
          <DialogTitle>시즈널 · {sym?.ticker ?? symbolId}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-1">
          {months.map((m) => (
            <div
              key={m.month}
              className={cn(
                "rounded px-1 py-2 text-center text-[10px]",
                m.avgReturn >= 0 ? "bg-emerald-900/40" : "bg-rose-900/40"
              )}
              style={{ opacity: 0.4 + (Math.abs(m.avgReturn) / max) * 0.6 }}
            >
              {m.month}월
              <br />
              {m.avgReturn.toFixed(2)}%
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CustomIndicatorDialog({
  open,
  onOpenChange,
  source,
  setSource,
  indicatorOnIndicator,
  setIndicatorOnIndicator,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  source: string;
  setSource: (s: string) => void;
  indicatorOnIndicator: ReturnType<typeof useWorkspace.getState>["indicatorOnIndicator"];
  setIndicatorOnIndicator: ReturnType<
    typeof useWorkspace.getState
  >["setIndicatorOnIndicator"];
}) {
  const saveScript = async () => {
    await fetch("/api/custom-indicators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "user_script", source }),
    });
    setSource(source);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-feature="indicator.custom_js">
        <DialogHeader>
          <DialogTitle>JS 커스텀 지표</DialogTitle>
        </DialogHeader>
        <label className="flex items-center gap-2 text-[11px]" data-feature="indicator.on_indicator">
          <input
            type="checkbox"
            checked={indicatorOnIndicator != null}
            onChange={(e) =>
              setIndicatorOnIndicator(
                e.target.checked ? { parent: "rsi", child: "sma20" } : null
              )
            }
          />
          RSI 위 SMA20 (지표 위 지표)
        </label>
        <textarea
          value={source || CUSTOM_INDICATOR_EXAMPLE}
          onChange={(e) => setSource(e.target.value)}
          rows={10}
          className="w-full rounded border bg-black/30 p-2 font-mono text-[11px]"
        />
        <Button size="sm" onClick={saveScript}>
          적용 · 저장
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Feature ID: social.publish — used from PostsTab */
export function PublishPostForm({
  onPublished,
}: {
  onPublished: () => void;
}) {
  const { activeSymbolId, upsertPost } = useWorkspace();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<PostCategory>("insight");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title: title.trim(),
          body: body.trim(),
          symbolIds: [activeSymbolId],
          ingestMethod: "manual_paste",
          autoOpinion: false,
        }),
      });
      const data = await res.json();
      if (data.post) {
        upsertPost(data.post);
        setTitle("");
        setBody("");
        onPublished();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-md border border-[var(--workspace-border)] bg-[var(--workspace-elevated)] p-2"
      data-feature="social.publish"
    >
      <div className="mb-1 text-xs font-semibold">게시</div>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as PostCategory)}
        className="mb-1 h-8 w-full rounded border px-1 text-xs"
      >
        {(Object.keys(CATEGORY_LABELS) as PostCategory[]).map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        className="mb-1 h-8 text-xs"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="본문"
        className="mb-1 w-full rounded border bg-[var(--workspace-panel)] p-2 text-xs"
      />
      <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={submit}>
        포스트 게시
      </Button>
    </div>
  );
}
