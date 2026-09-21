"use client";

import { useEffect, useMemo, useState } from "react";
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
  mockDomLadder,
  mockMacroRegions,
  mockOptionsChain,
  mockYieldCurve,
} from "@/lib/phase4-data";
import { cn } from "@/lib/utils";
import type { KiwoomOrderSide, KiwoomOrderType } from "@/lib/kiwoom/types";
import type { PaperAccount } from "@/lib/types";

function spotFromSymbol(key: string): number {
  if (key.includes("BTC")) return 68000;
  if (key.includes("ETH")) return 3400;
  if (key === "005930") return 78000;
  if (key === "NVDA") return 120;
  if (key === "AAPL") return 190;
  return 100 + (key.length % 5) * 12;
}

export function Phase4Panels() {
  const {
    optionsOpen,
    setOptionsOpen,
    yieldOpen,
    setYieldOpen,
    macroOpen,
    setMacroOpen,
    brokerOpen,
    setBrokerOpen,
    domOpen,
    setDomOpen,
    symbols,
    activeSymbolId,
    paperAccount,
    setPaperAccount,
  } = useWorkspace();

  const symbol = symbols.find((s) => s.id === activeSymbolId);
  const spot = spotFromSymbol(symbol?.ticker ?? activeSymbolId);

  return (
    <>
      <OptionsDialog
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        ticker={symbol?.ticker ?? activeSymbolId}
        spot={spot}
      />
      <YieldDialog open={yieldOpen} onOpenChange={setYieldOpen} />
      <MacroDialog open={macroOpen} onOpenChange={setMacroOpen} />
      <KiwoomTradeDialog
        open={brokerOpen}
        onOpenChange={setBrokerOpen}
        activeSymbolId={activeSymbolId}
        symbols={symbols}
        account={paperAccount}
        setAccount={setPaperAccount}
        spotHint={spot}
      />
      <DomDialog
        open={domOpen}
        onOpenChange={setDomOpen}
        mid={spot}
        ticker={symbol?.ticker ?? ""}
      />
    </>
  );
}

function OptionsDialog({
  open,
  onOpenChange,
  ticker,
  spot,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticker: string;
  spot: number;
}) {
  const chain = useMemo(
    () => mockOptionsChain(spot, ticker),
    [spot, ticker, open]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-lg overflow-auto border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="options.chain"
      >
        <DialogHeader>
          <DialogTitle data-feature="options.header">
            옵션 · {ticker} (지연 mock)
          </DialogTitle>
        </DialogHeader>
        <p className="text-[10px] text-[var(--workspace-muted)]">
          만기 {chain.expiry} · 실시간 체결 없음
        </p>
        <table className="w-full text-left font-mono text-[10px]">
          <thead>
            <tr className="text-[var(--workspace-muted)]">
              <th className="py-1">Strike</th>
              <th>C.bid/ask</th>
              <th>C.vol</th>
              <th>P.bid/ask</th>
              <th>IV</th>
            </tr>
          </thead>
          <tbody>
            {chain.rows.map((r) => (
              <tr
                key={r.strike}
                className={cn(
                  Math.abs(r.strike - spot) < 3 && "bg-[var(--brand-accent)]/10"
                )}
              >
                <td className="py-0.5">{r.strike}</td>
                <td>
                  {r.callBid}/{r.callAsk}
                </td>
                <td>{r.callVol}</td>
                <td>
                  {r.putBid}/{r.putAsk}
                </td>
                <td>{(r.iv * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}

function YieldDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [region, setRegion] = useState<"US" | "KR">("US");
  const curve = useMemo(() => mockYieldCurve(region), [region, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="yield_curves"
      >
        <DialogHeader>
          <DialogTitle>금리 곡선 (mock)</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          {(["US", "KR"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={region === r ? "default" : "ghost"}
              className="h-7 text-[10px]"
              onClick={() => setRegion(r)}
            >
              {r}
            </Button>
          ))}
        </div>
        <div className="space-y-1 font-mono text-[11px]">
          {curve.map((p) => (
            <div key={p.tenor} className="flex items-center gap-2">
              <span className="w-8 text-[var(--workspace-muted)]">
                {p.tenor}
              </span>
              <div
                className="h-2 rounded bg-emerald-500/70"
                style={{ width: `${p.yieldPct * 18}px` }}
              />
              <span>{p.yieldPct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MacroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const regions = useMemo(() => mockMacroRegions(), [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="macro.maps"
      >
        <DialogHeader>
          <DialogTitle>매크로 맵 (mock)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {regions.map((r) => (
            <div
              key={r.id}
              className="rounded border border-[var(--workspace-border)] p-2 text-[11px]"
            >
              <div className="flex justify-between font-medium">
                <span>
                  {r.nameKo}{" "}
                  <span className="text-[var(--workspace-muted)]">
                    {r.name}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-[10px] uppercase",
                    r.sentiment === "risk_on" && "text-emerald-400",
                    r.sentiment === "risk_off" && "text-rose-400",
                    r.sentiment === "neutral" && "text-slate-400"
                  )}
                >
                  {r.sentiment.replace("_", " ")}
                </span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-[var(--workspace-muted)]">
                GDP {r.gdpGrowth}% · CPI {r.inflation}% · 정책금리{" "}
                {r.policyRate}%
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KiwoomTradeDialog({
  open,
  onOpenChange,
  activeSymbolId,
  symbols,
  account,
  setAccount,
  spotHint,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeSymbolId: string;
  symbols: ReturnType<typeof useWorkspace.getState>["symbols"];
  account: PaperAccount;
  setAccount: (a: PaperAccount) => void;
  spotHint: number;
}) {
  const [qty, setQty] = useState("1");
  const [side, setSide] = useState<KiwoomOrderSide>("buy");
  const [type, setType] = useState<KiwoomOrderType>("market");
  const [limit, setLimit] = useState("");
  const [statusLine, setStatusLine] = useState("어댑터 확인 중…");
  const [adapterLabel, setAdapterLabel] = useState("—");
  const [busy, setBusy] = useState(false);
  const [lastMsg, setLastMsg] = useState<string | null>(null);
  const sym = symbols.find((s) => s.id === activeSymbolId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/kiwoom/order")
      .then((r) => r.json())
      .then(
        (d: {
          status?: { label?: string; ready?: boolean; mode?: string; notes?: string[] };
        }) => {
          if (cancelled) return;
          const s = d.status;
          setAdapterLabel(s?.label ?? "unknown");
          setStatusLine(
            s?.ready
              ? `${s.mode ?? "mock"} · 주문 가능`
              : `${s?.mode ?? "ocx"} · ${s?.notes?.[0] ?? "준비 안 됨"}`
          );
        }
      )
      .catch(() => {
        if (!cancelled) setStatusLine("어댑터 상태 조회 실패");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const submit = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setLastMsg("수량을 확인하세요");
      return;
    }
    setBusy(true);
    setLastMsg(null);
    try {
      const res = await fetch("/api/kiwoom/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbolId: activeSymbolId,
          side,
          type,
          qty: n,
          limitPrice: type === "limit" && limit ? Number(limit) : undefined,
          lastPrice: spotHint,
        }),
      });
      const data = (await res.json()) as {
        result?: { ok?: boolean; message?: string; fillPrice?: number; orderNo?: string };
        error?: string;
      };
      const msg =
        data.result?.message ?? data.error ?? (res.ok ? "완료" : "주문 실패");
      setLastMsg(msg);
      if (data.result?.ok) {
        const paper = await fetch("/api/paper").then((r) => r.json());
        if (paper.account) setAccount(paper.account);
      }
    } catch {
      setLastMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  const equity =
    account.cash +
    account.positions.reduce((a, p) => a + p.qty * p.avgCost, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="trade.kiwoom"
      >
        <DialogHeader>
          <DialogTitle>매매 · 키움</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-[11px] text-[var(--workspace-muted)]">
          <div>
            어댑터: <span className="text-[var(--workspace-fg)]">{adapterLabel}</span>
          </div>
          <div>{statusLine}</div>
          <div>
            종목{" "}
            <span className="font-mono text-[var(--workspace-fg)]">
              {sym?.ticker ?? activeSymbolId}
            </span>
            {sym?.nameKo ? ` · ${sym.nameKo}` : ""} · 참고가 {spotHint}
          </div>
          <div>
            현금 {account.cash.toFixed(0)} · 추정 {equity.toFixed(0)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as KiwoomOrderSide)}
            className="h-8 rounded border border-[var(--workspace-border)] bg-transparent px-1 text-xs"
            data-feature="trade.kiwoom.side"
          >
            <option value="buy">매수</option>
            <option value="sell">매도</option>
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as KiwoomOrderType)}
            className="h-8 rounded border border-[var(--workspace-border)] bg-transparent px-1 text-xs"
          >
            <option value="market">시장가</option>
            <option value="limit">지정가</option>
          </select>
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-8 w-16 text-xs"
            aria-label="수량"
          />
          {type === "limit" && (
            <Input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="가격"
              className="h-8 w-24 text-xs"
            />
          )}
          <Button
            size="sm"
            className={cn(
              "h-8 text-xs",
              side === "buy" ? "bg-rose-600 hover:bg-rose-500" : "bg-blue-600 hover:bg-blue-500"
            )}
            disabled={busy}
            onClick={submit}
            data-feature="trade.kiwoom.submit"
          >
            {busy ? "전송…" : side === "buy" ? "매수" : "매도"}
          </Button>
        </div>
        {lastMsg && (
          <div
            className="rounded border border-[var(--workspace-border)] px-2 py-1.5 text-[11px]"
            data-feature="trade.kiwoom.status"
          >
            {lastMsg}
          </div>
        )}
        <div className="max-h-36 space-y-1 overflow-y-auto text-[11px]">
          {account.orders.slice(0, 8).map((o) => (
            <div key={o.id} className="flex justify-between font-mono">
              <span>
                {o.side === "buy" ? "매수" : "매도"} {o.qty}
                {o.fillPrice != null ? ` @ ${o.fillPrice}` : ""}
              </span>
              <span className="text-[var(--workspace-faint)]">
                {o.id.replace(/^kiwoom_/, "")}
              </span>
            </div>
          ))}
          {account.orders.length === 0 && (
            <div className="text-[var(--workspace-faint)]">주문 기록 없음</div>
          )}
        </div>
        <p className="text-[10px] text-[var(--workspace-faint)]">
          기본은 로컬 모의(mock). 실계좌·영웅문 OCX는 스텁만 — 키는 저장소에 넣지 마세요.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function DomDialog({
  open,
  onOpenChange,
  mid,
  ticker,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mid: number;
  ticker: string;
}) {
  const ladder = useMemo(() => mockDomLadder(mid), [mid, open]);
  const [flashSide, setFlashSide] = useState<"bid" | "ask" | null>(null);
  const [lastTrade, setLastTrade] = useState(mid);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      const side = Math.random() > 0.5 ? "bid" : "ask";
      setFlashSide(side);
      setLastTrade(
        round(mid * (1 + (Math.random() - 0.5) * 0.0004 * (side === "ask" ? 1 : -1)))
      );
      window.setTimeout(() => setFlashSide(null), 280);
    }, 2200);
    return () => window.clearInterval(id);
  }, [open, mid]);

  const maxSize = Math.max(...ladder.map((r) => r.bidSize + r.askSize), 1);
  const bestAsk = ladder.find((r) => r.askSize > 0)?.price ?? mid;
  const bestBid = [...ladder].reverse().find((r) => r.bidSize > 0)?.price ?? mid;
  const spread = bestAsk - bestBid;
  const bidDepth = ladder.reduce((s, r) => s + r.bidSize, 0);
  const askDepth = ladder.reduce((s, r) => s + r.askSize, 0);
  const imbalance =
    bidDepth + askDepth > 0
      ? ((bidDepth - askDepth) / (bidDepth + askDepth)) * 100
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="dom"
      >
        <DialogHeader>
          <DialogTitle>
            호가창 · {ticker || "—"} (mock DOM)
          </DialogTitle>
        </DialogHeader>
        <div className="mb-2 flex items-center justify-between font-mono text-[10px] text-[var(--workspace-muted)]">
          <span>
            스프레드{" "}
            <span className="text-[var(--workspace-fg)]">{spread.toFixed(2)}</span>
            {" · "}
            불균형{" "}
            <span
              className={
                imbalance >= 0 ? "text-rose-300" : "text-sky-300"
              }
            >
              {imbalance >= 0 ? "+" : ""}
              {imbalance.toFixed(1)}%
            </span>
          </span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 transition-colors",
              flashSide === "bid" && "bg-rose-500/25 text-rose-200",
              flashSide === "ask" && "bg-sky-500/25 text-sky-200"
            )}
          >
            체결 {lastTrade.toFixed(2)}
          </span>
        </div>
        <div className="font-mono text-[10px]">
          <div className="mb-1 grid grid-cols-[1fr_4.5rem_1fr] gap-1 text-[var(--workspace-muted)]">
            <span>매수 · 누적</span>
            <span className="text-center">가격</span>
            <span className="text-right">누적 · 매도</span>
          </div>
          {ladder.map((row) => {
            const bidPct = (row.bidSize / maxSize) * 100;
            const askPct = (row.askSize / maxSize) * 100;
            const isMid = Math.abs(row.price - mid) < 0.0001;
            return (
              <div
                key={row.price}
                className={cn(
                  "relative grid grid-cols-[1fr_4.5rem_1fr] gap-1 border-b border-[var(--workspace-border)]/40 py-0.5",
                  isMid && "bg-[var(--brand-accent)]/10"
                )}
              >
                <div className="relative flex items-center pr-1">
                  <div
                    className="absolute inset-y-0 right-0 rounded-sm bg-rose-500/20"
                    style={{ width: `${bidPct}%` }}
                  />
                  <span className="relative z-[1] text-rose-300/90">
                    {row.bidSize > 0 ? row.bidSize : ""}
                  </span>
                </div>
                <span className="text-center text-[var(--workspace-fg)]">
                  {row.price.toFixed(2)}
                </span>
                <div className="relative flex items-center justify-end pl-1">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm bg-sky-500/20"
                    style={{ width: `${askPct}%` }}
                  />
                  <span className="relative z-[1] text-sky-300/90">
                    {row.askSize > 0 ? row.askSize : ""}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
