"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { krwToUsd } from "@/lib/kiwoom/rest-trade";
import { useWorkspace } from "@/lib/store";
import type { SymbolMeta } from "@/lib/types";

interface PositionRow {
  code: string;
  name: string;
  qty: number;
  sellableQty: number;
  avgPrice: number | null;
  lastPrice: number | null;
  pnl: number | null;
  returnPct: number | null;
  purchaseAmount: number | null;
  evalAmount: number | null;
  weightPct: number | null;
}

interface AccountView {
  mode: "paper" | "rest";
  live: boolean;
  deposit: number | null;
  orderable: number | null;
  usdKrw: number | null;
  summary?: {
    purchase: number | null;
    evaluation: number | null;
    pnl: number | null;
    returnPct: number | null;
    estimatedAssets: number | null;
  };
  positions: PositionRow[];
  accountNo?: string | null;
  error?: string;
  outboundIp?: string | null;
}

function krw(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(value)).toLocaleString("ko-KR")}원`;
}

function usd(value: number | null | undefined): string {
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

function share(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function tone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-[var(--workspace-fg)]";
  return value > 0 ? "text-emerald-400" : "text-rose-400";
}

function MoneyPair({
  label,
  amount,
  rate,
  emphasize,
}: {
  label: string;
  amount: number | null | undefined;
  rate: number | null;
  emphasize?: "pnl";
}) {
  return (
    <div className="rounded-md border border-[var(--workspace-border)] px-3 py-2">
      <div className="text-[10px] text-[var(--workspace-faint)]">{label}</div>
      <div className={cn("mt-0.5 font-mono text-sm", emphasize === "pnl" && tone(amount))}>
        {krw(amount)}
      </div>
      <div className={cn("font-mono text-[11px] text-[var(--workspace-muted)]", emphasize === "pnl" && tone(amount))}>
        {usd(krwToUsd(amount ?? null, rate))}
      </div>
    </div>
  );
}

export function KiwoomAccountDialog({
  open,
  onOpenChange,
  symbols,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbols: SymbolMeta[];
}) {
  const setActiveSymbol = useWorkspace((s) => s.setActiveSymbol);
  const [account, setAccount] = useState<AccountView | null>(null);

  const load = () => {
    fetch("/api/kiwoom/account")
      .then(async (res) => (await res.json()) as AccountView)
      .then((data) => setAccount(data))
      .catch(() => setAccount(null));
  };

  useEffect(() => {
    if (!open) return;
    load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [open]);

  const live = account?.live === true;
  const rate = account?.mode === "rest" ? account.usdKrw : null;
  const rows = account?.positions ?? [];

  const openSymbol = (code: string) => {
    const known = symbols.find((s) => s.ticker === code || s.id === code);
    if (!known) return;
    setActiveSymbol(known.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] max-w-5xl overflow-auto border-[var(--workspace-border)] bg-[var(--workspace-panel)]"
        data-feature="trade.kiwoom.account.panel"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            계좌 · 키움
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                live ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-200"
              )}
            >
              {account == null ? "확인 중" : live ? "실전" : account.mode === "rest" ? "모의" : "로컬 모의"}
            </span>
            {account?.accountNo && (
              <span className="font-mono text-[11px] font-normal text-[var(--workspace-muted)]">
                {account.accountNo}
              </span>
            )}
            <button type="button" className="ml-auto text-[11px] font-normal text-[var(--workspace-muted)] underline" onClick={load}>
              새로고침
            </button>
          </DialogTitle>
        </DialogHeader>

        {account?.error && <div className="text-[12px] text-rose-300">{account.error}</div>}
        {account?.outboundIp && (
          <div className="text-[12px] text-[var(--workspace-fg)]">
            이 PC의 주소 <span className="font-mono text-rose-200">{account.outboundIp}</span>
            를 키움 API 사용신청에 추가하세요.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MoneyPair label="총평가" amount={account?.summary?.evaluation} rate={rate} />
          <MoneyPair label="추정자산" amount={account?.summary?.estimatedAssets} rate={rate} />
          <MoneyPair label="예수금" amount={account?.deposit} rate={rate} />
          <MoneyPair label="평가손익" amount={account?.summary?.pnl} rate={rate} emphasize="pnl" />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--workspace-muted)]">
          <span>총매입 {krw(account?.summary?.purchase)}</span>
          <span className={tone(account?.summary?.returnPct)}>
            총수익률 {pct(account?.summary?.returnPct)}
          </span>
          <span>주문가능 {krw(account?.orderable)}</span>
          <span>보유 {rows.length}종목</span>
          <span>
            {rate != null ? `1달러 ${Math.round(rate).toLocaleString("ko-KR")}원` : "달러 환율 없음"}
          </span>
        </div>

        {rows.length ? (
          <div className="max-h-[48vh] overflow-auto rounded-md border border-[var(--workspace-border)]">
            <table className="w-full min-w-[760px] border-collapse text-left font-mono text-[11px]">
              <thead className="sticky top-0 bg-[var(--workspace-panel)] text-[10px] text-[var(--workspace-faint)]">
                <tr>
                  {["종목", "보유", "가능", "매수가", "현재가", "매입금액", "평가금액", "손익", "수익률", "비중"].map(
                    (label, index) => (
                      <th key={label} className={cn("px-2 py-1.5 font-normal", index > 0 && "text-right")}>
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const known = symbols.find((s) => s.ticker === row.code || s.id === row.code);
                  return (
                    <tr
                      key={row.code}
                      className={cn(
                        "border-t border-[var(--workspace-border)]",
                        known && "cursor-pointer hover:bg-white/5"
                      )}
                      onClick={() => openSymbol(row.code)}
                    >
                      <td className="max-w-[140px] truncate px-2 py-1.5 text-[var(--workspace-fg)]" title={row.name}>
                        {known?.nameKo || row.name}
                        <span className="ml-1 text-[10px] text-[var(--workspace-faint)]">{row.code}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right">{row.qty.toLocaleString("ko-KR")}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--workspace-muted)]">
                        {row.sellableQty.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-2 py-1.5 text-right">{krw(row.avgPrice)}</td>
                      <td className="px-2 py-1.5 text-right">{krw(row.lastPrice)}</td>
                      <td className="px-2 py-1.5 text-right">{krw(row.purchaseAmount)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <div>{krw(row.evalAmount)}</div>
                        <div className="text-[10px] text-[var(--workspace-faint)]">
                          {usd(krwToUsd(row.evalAmount, rate))}
                        </div>
                      </td>
                      <td className={cn("px-2 py-1.5 text-right", tone(row.pnl))}>{krw(row.pnl)}</td>
                      <td className={cn("px-2 py-1.5 text-right", tone(row.returnPct))}>{pct(row.returnPct)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--workspace-muted)]">{share(row.weightPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[12px] text-[var(--workspace-faint)]">
            {account == null
              ? "계좌를 불러오는 중"
              : account.error
                ? "계좌를 읽지 못했습니다"
                : account.accountNo
                  ? `계좌 ${account.accountNo} 국내 주식 잔고가 비어 있습니다. 영웅문 계좌번호와 다르면 키움 API 사용신청에서 그 계좌의 앱 키로 다시 받아야 합니다. 미국 주식은 이 화면에 나오지 않습니다.`
                  : "국내 주식 잔고가 비어 있습니다. 미국 주식은 이 화면에 나오지 않습니다."}
          </div>
        )}

        <p className="text-[10px] text-[var(--workspace-faint)]">
          국내 주식 잔고입니다. 평가금액의 달러는 현재 원/달러 환율로 나눈 값이고, 수익률은 매수가 대비 현재가입니다.
          차트에 있는 종목을 누르면 그 차트로 이동합니다.
        </p>
      </DialogContent>
    </Dialog>
  );
}
