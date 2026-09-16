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
import {
  mockBrokerConnected,
  mockBrokerDisconnected,
  mockDomLadder,
  mockMacroRegions,
  mockOptionsChain,
  mockYieldCurve,
  type BrokerStubStatus,
} from "@/lib/phase4-data";
import { cn } from "@/lib/utils";

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
      <BrokerDialog
        open={brokerOpen}
        onOpenChange={setBrokerOpen}
        accountSeed={activeSymbolId}
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

function BrokerDialog({
  open,
  onOpenChange,
  accountSeed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountSeed: string;
}) {
  const [status, setStatus] = useState<BrokerStubStatus>(
    mockBrokerDisconnected()
  );

  useEffect(() => {
    if (!open) setStatus(mockBrokerDisconnected());
  }, [open]);

  const connect = () => {
    setStatus({ ...mockBrokerDisconnected(), state: "connecting" });
    window.setTimeout(() => {
      setStatus(mockBrokerConnected(accountSeed));
    }, 600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="trade.broker"
      >
        <DialogHeader>
          <DialogTitle>브로커 연결 (stub)</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-[var(--workspace-muted)]">
          {status.message}
        </p>
        <dl className="space-y-1 font-mono text-[11px]">
          <div className="flex justify-between">
            <dt>상태</dt>
            <dd>{status.state}</dd>
          </div>
          <div className="flex justify-between">
            <dt>브로커</dt>
            <dd>{status.brokerName}</dd>
          </div>
          <div className="flex justify-between">
            <dt>계좌</dt>
            <dd>{status.accountId}</dd>
          </div>
          <div className="flex justify-between">
            <dt>매수가능</dt>
            <dd>
              {status.buyingPower > 0
                ? `$${status.buyingPower.toLocaleString()}`
                : "—"}
            </dd>
          </div>
        </dl>
        <Button
          size="sm"
          className="h-8"
          disabled={status.state === "connecting" || status.state === "connected_mock"}
          onClick={connect}
        >
          {status.state === "connecting"
            ? "연결 중…"
            : status.state === "connected_mock"
              ? "연결됨 (mock)"
              : "모의 연결"}
        </Button>
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
