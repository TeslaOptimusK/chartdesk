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
import { cn } from "@/lib/utils";
import { toKiwoomCode } from "@/lib/kiwoom/quote-protocol";
import { buildScaleInOrders } from "@/lib/kiwoom/scale-plan";
import type { SymbolMeta } from "@/lib/types";

type Side = "buy" | "sell";
type OrderType = "market" | "limit" | "scale";

interface PositionRow {
  code: string;
  name: string;
  qty: number;
  currency?: string;
  avgPrice: number | null;
  lastPrice: number | null;
  pnl: number | null;
  returnPct: number | null;
}

interface HoldingsSummary {
  purchase: number | null;
  evaluation: number | null;
  pnl: number | null;
  returnPct: number | null;
}

interface BracketRow {
  id: string;
  code: string;
  qty: number;
  takeProfit: number | null;
  stopLoss: number | null;
  orderNos: { orderNo: string; qty: number }[];
}

interface AccountView {
  mode: "paper" | "rest";
  live: boolean;
  deposit: number | null;
  orderable: number | null;
  summary?: HoldingsSummary;
  positions: PositionRow[];
  brackets: BracketRow[];
  error?: string;
  outboundIp?: string | null;
}

function won(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("ko-KR");
}

function money(value: number | null | undefined, currency?: string): string {
  if ((currency ?? "KRW") === "KRW") return won(value);
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function tone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-[var(--workspace-fg)]";
  return value > 0 ? "text-emerald-400" : "text-rose-400";
}

export function KiwoomTradeDialog({
  open,
  onOpenChange,
  activeSymbolId,
  symbols,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeSymbolId: string;
  symbols: SymbolMeta[];
}) {
  const scaleBand = useWorkspace((s) => s.scaleBuyBand);
  const chartOrderLines = useWorkspace((s) => s.chartOrderLines);
  const setChartOrderLines = useWorkspace((s) => s.setChartOrderLines);
  const setScaleBuyPicking = useWorkspace((s) => s.setScaleBuyPicking);
  const sym = symbols.find((s) => s.id === activeSymbolId);
  const [account, setAccount] = useState<AccountView | null>(null);
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [qty, setQty] = useState("1");
  const [limit, setLimit] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [splits, setSplits] = useState("4");
  const [confirmLive, setConfirmLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastMsg, setLastMsg] = useState<string | null>(null);

  const loadAccount = () => {
    fetch("/api/kiwoom/account")
      .then(async (res) => ({ res, data: (await res.json()) as AccountView }))
      .then(({ data }) => setAccount(data))
      .catch(() => setAccount(null));
  };

  useEffect(() => {
    if (!open) return;
    setConfirmLive(false);
    loadAccount();
    const id = window.setInterval(loadAccount, 15000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!chartOrderLines || chartOrderLines.symbolId !== activeSymbolId) return;
    const us = sym?.assetClass === "us_stock";
    const text = (n: number | null) =>
      n == null ? "" : us ? n.toFixed(2) : String(Math.round(n));
    if (chartOrderLines.entry != null) setLimit(text(chartOrderLines.entry));
    setTakeProfit(text(chartOrderLines.takeProfit));
    setStopLoss(text(chartOrderLines.stopLoss));
  }, [chartOrderLines, activeSymbolId, sym?.assetClass]);

  const pushLines = (patch: {
    entry?: number | null;
    takeProfit?: number | null;
    stopLoss?: number | null;
  }) => {
    const cur =
      chartOrderLines?.symbolId === activeSymbolId
        ? chartOrderLines
        : { symbolId: activeSymbolId, entry: null, takeProfit: null, stopLoss: null };
    setChartOrderLines({ ...cur, ...patch, symbolId: activeSymbolId });
  };

  useEffect(() => {
    if (!open || !scaleBand || scaleBand.symbolId !== activeSymbolId) return;
    setLow(String(Math.round(scaleBand.low)));
    setHigh(String(Math.round(scaleBand.high)));
    setOrderType("scale");
    setSide("buy");
  }, [open, scaleBand, activeSymbolId]);

  const preview = useMemo(() => {
    if (orderType !== "scale") return { slices: [], error: null as string | null };
    try {
      return {
        slices: buildScaleInOrders(Number(low), Number(high), Number(splits), Number(qty)),
        error: null as string | null,
      };
    } catch (err) {
      return {
        slices: [],
        error: err instanceof Error ? err.message : "분할 범위를 확인하세요",
      };
    }
  }, [orderType, low, high, splits, qty]);

  const krCode = sym ? toKiwoomCode(sym.ticker, sym.exchange, sym.assetClass) : null;
  const live = account?.live === true;
  const rest = account?.mode === "rest";

  const beginRange = () => {
    setScaleBuyPicking(true);
    onOpenChange(false);
  };

  const submit = async () => {
    const n = Math.trunc(Number(qty));
    if (!Number.isFinite(n) || n <= 0) {
      setLastMsg("수량을 확인하세요");
      return;
    }
    if (orderType === "scale" && preview.error) {
      setLastMsg(preview.error);
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
          side: orderType === "scale" ? "buy" : side,
          type: orderType,
          qty: n,
          limitPrice: orderType === "limit" ? Number(limit) : undefined,
          takeProfit: side === "buy" && takeProfit ? Number(takeProfit) : undefined,
          stopLoss: side === "buy" && stopLoss ? Number(stopLoss) : undefined,
          confirmLive,
          scale:
            orderType === "scale"
              ? { low: Number(low), high: Number(high), splits: Number(splits) }
              : undefined,
        }),
      });
      const data = (await res.json()) as {
        result?: { ok?: boolean; message?: string; orders?: { price: number | null; qty: number }[] };
        error?: string;
      };
      setLastMsg(data.result?.message ?? data.error ?? (res.ok ? "접수" : "주문 실패"));
      if (data.result?.ok) loadAccount();
    } catch {
      setLastMsg("네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  const releaseBracket = async (id: string, cancel: boolean) => {
    const res = await fetch(
      `/api/kiwoom/brackets?id=${encodeURIComponent(id)}${cancel ? "&cancel=1" : ""}`,
      { method: "DELETE" }
    );
    const data = (await res.json().catch(() => ({}))) as { failed?: number; error?: string };
    if (data.failed) setLastMsg(`미체결 취소 실패 ${data.failed}건`);
    else if (!res.ok) setLastMsg(data.error ?? "감시 해제 실패");
    loadAccount();
  };

  const blocked =
    busy || (live && !confirmLive) || (rest && !krCode) || (orderType === "scale" && Boolean(preview.error));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-2xl overflow-auto border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="trade.kiwoom"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            매매 · 키움
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                live ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-200"
              )}
            >
              {account == null ? "확인 중" : live ? "실전" : account.mode === "rest" ? "모의" : "로컬 모의"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-[11px]" data-feature="trade.kiwoom.account">
          <div className="text-[var(--workspace-muted)]">
            {sym?.nameKo || sym?.ticker || activeSymbolId}
            <span className="ml-1 font-mono text-[var(--workspace-fg)]">{sym?.ticker}</span>
          </div>
          <div className="flex gap-3 font-mono text-[var(--workspace-fg)]">
            <span>예수금 {won(account?.deposit)}</span>
            <span>주문가능 {won(account?.orderable)}</span>
          </div>
          {account?.error && <div className="text-rose-300">{account.error}</div>}
          {account?.outboundIp && (
            <div className="text-[var(--workspace-fg)]">
              이 PC의 주소{" "}
              <span className="font-mono text-rose-200">{account.outboundIp}</span>
              를 키움 API 사용신청에 추가하세요.
            </div>
          )}
        </div>

        <div
          className="overflow-hidden rounded-md border border-[var(--workspace-border)]"
          data-feature="trade.kiwoom.holdings"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] font-medium text-[var(--workspace-fg)]">보유</span>
            <button
              type="button"
              className="text-[10px] text-[var(--workspace-muted)] underline"
              onClick={loadAccount}
            >
              새로고침
            </button>
          </div>
          {account?.summary &&
            (account.summary.purchase != null || account.summary.evaluation != null) && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 pb-1.5 font-mono text-[10px] text-[var(--workspace-muted)]">
                <span>매입 {won(account.summary.purchase)}</span>
                <span>평가 {won(account.summary.evaluation)}</span>
                <span className={tone(account.summary.pnl)}>손익 {won(account.summary.pnl)}</span>
                <span className={tone(account.summary.returnPct)}>
                  수익률 {pct(account.summary.returnPct)}
                </span>
              </div>
            )}
          {account?.positions?.length ? (
            <div className="max-h-40 overflow-auto">
              <div className="grid grid-cols-[minmax(0,1.5fr)_3rem_4.5rem_4.5rem_4.2rem_4.8rem] gap-x-2 px-2 py-1 text-[10px] text-[var(--workspace-faint)]">
                <span>종목</span>
                <span className="text-right">수량</span>
                <span className="text-right">매수가</span>
                <span className="text-right">현재가</span>
                <span className="text-right">수익률</span>
                <span className="text-right">평가손익</span>
              </div>
              {account.positions.map((p) => {
                const known = symbols.find((s) => s.id === p.code || s.ticker === p.code);
                const title = known?.nameKo || p.name;
                const ticker = known?.ticker || p.code;
                return (
                  <div
                    key={p.code}
                    className="grid grid-cols-[minmax(0,1.5fr)_3rem_4.5rem_4.5rem_4.2rem_4.8rem] gap-x-2 border-t border-[var(--workspace-border)] px-2 py-1 font-mono text-[11px]"
                  >
                    <span className="min-w-0 truncate text-[var(--workspace-fg)]" title={title}>
                      {title}
                      {ticker !== title && (
                        <span className="ml-1 text-[10px] text-[var(--workspace-faint)]">{ticker}</span>
                      )}
                    </span>
                    <span className="text-right text-[var(--workspace-fg)]">{p.qty}</span>
                    <span className="text-right text-[var(--workspace-fg)]">{money(p.avgPrice, p.currency)}</span>
                    <span className="text-right text-[var(--workspace-fg)]">{money(p.lastPrice, p.currency)}</span>
                    <span className={cn("text-right", tone(p.returnPct))}>{pct(p.returnPct)}</span>
                    <span className={cn("text-right", tone(p.pnl))}>{money(p.pnl, p.currency)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-2 pb-2 text-[10px] text-[var(--workspace-faint)]">
              {account == null
                ? "보유 종목을 불러오는 중"
                : account.error
                  ? "계좌를 읽지 못해 보유를 표시하지 못했습니다"
                  : "보유 종목 없음"}
            </div>
          )}
        </div>

        <div className="flex gap-1" data-feature="trade.kiwoom.side">
          {(["buy", "sell"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={side === value && orderType !== "scale" ? "default" : "ghost"}
              className={cn(
                "h-8 flex-1 text-xs",
                side === value && orderType !== "scale" && value === "buy" && "bg-rose-600 hover:bg-rose-500",
                side === value && orderType !== "scale" && value === "sell" && "bg-blue-600 hover:bg-blue-500"
              )}
              onClick={() => {
                setSide(value);
                if (value === "sell" && orderType === "scale") setOrderType("limit");
              }}
            >
              {value === "buy" ? "매수" : "매도"}
            </Button>
          ))}
        </div>

        <div className="flex gap-1 text-[11px]">
          {(
            [
              ["market", "시장가"],
              ["limit", "지정가"],
              ["scale", "분할"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cn(
                "h-7 flex-1 rounded border border-[var(--workspace-border)]",
                orderType === value && "border-amber-400/70 text-[var(--workspace-fg)]"
              )}
              onClick={() => {
                setOrderType(value);
                if (value === "scale") setSide("buy");
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-[var(--workspace-muted)]">
            수량
            <Input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1 h-8 text-xs"
              inputMode="numeric"
            />
          </label>
          {orderType === "limit" && (
            <label className="text-[10px] text-[var(--workspace-muted)]">
              가격
              <Input
                value={limit}
                onChange={(e) => {
                  setLimit(e.target.value);
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) pushLines({ entry: n });
                }}
                className="mt-1 h-8 text-xs"
                inputMode="decimal"
              />
            </label>
          )}
        </div>

        {side === "buy" && (
          <div className="grid grid-cols-2 gap-2" data-feature="trade.kiwoom.bracket">
            <label className="text-[10px] text-[var(--workspace-muted)]">
              매도 목표가
              <Input
                value={takeProfit}
                onChange={(e) => {
                  setTakeProfit(e.target.value);
                  const n = Number(e.target.value);
                  pushLines({ takeProfit: Number.isFinite(n) && n > 0 ? n : null });
                }}
                placeholder="비우면 없음"
                className="mt-1 h-8 text-xs"
                inputMode="decimal"
              />
            </label>
            <label className="text-[10px] text-[var(--workspace-muted)]">
              손절가
              <Input
                value={stopLoss}
                onChange={(e) => {
                  setStopLoss(e.target.value);
                  const n = Number(e.target.value);
                  pushLines({ stopLoss: Number.isFinite(n) && n > 0 ? n : null });
                }}
                placeholder="비우면 없음"
                className="mt-1 h-8 text-xs"
                inputMode="decimal"
              />
            </label>
          </div>
        )}

        {orderType === "scale" && (
          <div className="space-y-2" data-feature="trade.kiwoom.scale">
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[10px] text-[var(--workspace-muted)]">
                하단
                <Input value={low} onChange={(e) => setLow(e.target.value)} className="mt-1 h-8 text-xs" />
              </label>
              <label className="text-[10px] text-[var(--workspace-muted)]">
                상단
                <Input value={high} onChange={(e) => setHigh(e.target.value)} className="mt-1 h-8 text-xs" />
              </label>
              <label className="text-[10px] text-[var(--workspace-muted)]">
                분할
                <Input
                  value={splits}
                  onChange={(e) => setSplits(e.target.value)}
                  className="mt-1 h-8 text-xs"
                  inputMode="numeric"
                />
              </label>
            </div>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" onClick={beginRange}>
              차트에서 범위 지정
            </Button>
            {preview.error ? (
              <div className="text-[11px] text-rose-300">{preview.error}</div>
            ) : (
              <div className="max-h-28 space-y-0.5 overflow-auto font-mono text-[10px] text-[var(--workspace-muted)]">
                {preview.slices.map((slice) => (
                  <div key={slice.price} className="flex justify-between">
                    <span>지정가 {won(slice.price)}</span>
                    <span>{slice.qty}주</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {live && (
          <label className="flex items-center gap-2 text-[11px] text-rose-200" data-feature="trade.kiwoom.confirm">
            <input
              type="checkbox"
              checked={confirmLive}
              onChange={(e) => setConfirmLive(e.target.checked)}
            />
            실전 계좌로 주문을 전송합니다
          </label>
        )}

        {rest && !krCode && (
          <div className="text-[11px] text-amber-200">키움 주문은 국내 6자리 종목만 가능합니다.</div>
        )}

        <Button
          size="sm"
          className={cn(
            "h-9 text-xs",
            side === "sell" && orderType !== "scale"
              ? "bg-blue-600 hover:bg-blue-500"
              : "bg-rose-600 hover:bg-rose-500"
          )}
          disabled={blocked}
          onClick={submit}
          data-feature="trade.kiwoom.submit"
        >
          {busy ? "전송…" : orderType === "scale" ? "분할 매수" : side === "buy" ? "매수" : "매도"}
        </Button>

        {lastMsg && (
          <div
            className="rounded border border-[var(--workspace-border)] px-2 py-1.5 text-[11px]"
            data-feature="trade.kiwoom.status"
          >
            {lastMsg}
          </div>
        )}

        {account?.brackets && account.brackets.length > 0 && (
          <div className="space-y-1 text-[10px]" data-feature="trade.kiwoom.brackets">
            {account.brackets.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 font-mono">
                <span>
                  {b.code} {b.qty}주 · 목표 {won(b.takeProfit)} · 손절 {won(b.stopLoss)}
                </span>
                <span className="flex gap-1">
                  {b.orderNos.length > 0 && (
                    <button type="button" className="underline" onClick={() => releaseBracket(b.id, true)}>
                      미체결 취소
                    </button>
                  )}
                  <button type="button" className="underline" onClick={() => releaseBracket(b.id, false)}>
                    감시 해제
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-[var(--workspace-faint)]">
          {live
            ? "목표가·손절은 이 앱이 켜져 있는 동안 실시간 시세를 보고, 보유 수량만 시장가로 매도합니다. 손절이 닿으면 남은 분할 매수도 취소합니다."
            : account?.mode === "rest"
              ? "모의투자 서버로 주문합니다. 목표가·손절은 앱이 켜져 있는 동안 모의 시세로 감시합니다."
              : "키움 키가 없으면 이 컴퓨터의 모의 장부에만 체결됩니다. 목표가·손절 감시는 키움 시세가 있을 때 동작합니다."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
