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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xs border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="dom"
      >
        <DialogHeader>
          <DialogTitle>
            호가창 · {ticker || "—"} (mock DOM)
          </DialogTitle>
        </DialogHeader>
        <div className="font-mono text-[10px]">
          <div className="mb-1 grid grid-cols-3 text-[var(--workspace-muted)]">
            <span>매수</span>
            <span className="text-center">가격</span>
            <span className="text-right">매도</span>
          </div>
          {ladder.map((row) => (
            <div
              key={row.price}
              className="grid grid-cols-3 border-b border-[var(--workspace-border)]/40 py-0.5"
            >
              <span className="text-rose-300/90">
                {row.bidSize > 0 ? row.bidSize : ""}
              </span>
              <span className="text-center text-[var(--workspace-fg)]">
                {row.price.toFixed(2)}
              </span>
              <span className="text-right text-sky-300/90">
                {row.askSize > 0 ? row.askSize : ""}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
