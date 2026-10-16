"use client";

import { Fragment, useEffect, useState } from "react";
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
  currency?: string;
  avgPrice: number | null;
  lastPrice: number | null;
  pnl: number | null;
  returnPct: number | null;
  purchaseAmount: number | null;
  evalAmount: number | null;
  krwAvgPrice?: number | null;
  krwLastPrice?: number | null;
  krwPurchaseAmount?: number | null;
  krwEvalAmount?: number | null;
  krwPnl?: number | null;
  weightPct: number | null;
  venue?: "ND" | "NY" | "NA";
  lots?: { date: string; time?: string; qty: number; price: number }[];
}

interface FxCashRow {
  currency: string;
  deposit: number | null;
  evalAmount: number | null;
  rate: number | null;
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
  fxCash?: FxCashRow[];
  accountNo?: string | null;
  error?: string;
  outboundIp?: string | null;
  historyNote?: string | null;
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

function dualMoney(
  currency: string | undefined,
  native: number | null | undefined,
  wonAmount: number | null | undefined,
  rate: number | null
) {
  if ((currency ?? "KRW") !== "KRW") {
    return (
      <>
        <div>{usd(native)}</div>
        <div className="text-[10px] text-[var(--workspace-faint)]">{krw(wonAmount)}</div>
      </>
    );
  }
  return (
    <>
      <div>{krw(native)}</div>
      <div className="text-[10px] text-[var(--workspace-faint)]">{usd(krwToUsd(native ?? null, rate))}</div>
    </>
  );
}

function lotWhen(lot: { date: string; time?: string }): string {
  if (lot.date.length !== 8) return "이전 잔고";
  const day = `${lot.date.slice(0, 4)}-${lot.date.slice(4, 6)}-${lot.date.slice(6)}`;
  const clock = (lot.time ?? "").replace(/\D/g, "");
  if (clock.length < 4) return day;
  return `${day} ${clock.slice(0, 2)}:${clock.slice(2, 4)}`;
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
  const [openLots, setOpenLots] = useState<Record<string, boolean>>({});
  const [confirmLive, setConfirmLive] = useState(false);
  const [sellMsg, setSellMsg] = useState<string | null>(null);
  const [ipNotice, setIpNotice] = useState<string | null>(null);

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

  useEffect(() => {
    const ip = account?.outboundIp;
    if (!ip || account?.error) return;
    const key = "chartdesk.kiwoom-ip";
    const prev = window.localStorage.getItem(key);
    if (prev && prev !== ip) {
      setIpNotice(`접속 주소가 ${prev}에서 ${ip}로 바뀌었습니다. 키움 등록 목록에 새 주소가 없으면 다음 조회가 막힙니다.`);
    } else {
      setIpNotice(null);
    }
    window.localStorage.setItem(key, ip);
  }, [account?.outboundIp, account?.error]);

  const sellLot = async (row: PositionRow, qty: number) => {
    setSellMsg(null);
    const res = await fetch("/api/kiwoom/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: row.code,
        qty,
        stex: row.venue ?? "ND",
        confirmLive,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; orderNo?: string };
    if (!res.ok) {
      setSellMsg(data.error ?? "매도에 실패했습니다");
      return;
    }
    setSellMsg(`${row.code} ${qty}주 매도 접수 ${data.orderNo ?? ""}`);
    load();
  };

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
        className="h-[92vh] max-h-[92vh] w-[96vw] max-w-[96vw] overflow-auto border-[var(--workspace-border)] bg-[var(--workspace-panel)] sm:max-w-[96vw]"
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
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--workspace-fg)]">
            <span>
              이 PC 접속 주소 <span className="font-mono text-rose-200">{account.outboundIp}</span>
            </span>
            <button
              type="button"
              className="rounded border border-[var(--workspace-border)] px-2 py-0.5 text-[11px]"
              onClick={() => void navigator.clipboard.writeText(account.outboundIp ?? "")}
            >
              주소 복사
            </button>
            <span className="text-[11px] text-[var(--workspace-faint)]">
              키움은 등록된 주소만 허용하고, 집 IP는 바뀝니다. 바뀐 주소를 사용신청에 추가하세요.
            </span>
          </div>
        )}
        {ipNotice && <div className="text-[12px] text-amber-200">{ipNotice}</div>}
        {sellMsg && <div className="text-[12px] text-[var(--workspace-fg)]">{sellMsg}</div>}
        {live && (
          <label className="flex items-center gap-2 text-[12px] text-rose-200">
            <input
              type="checkbox"
              checked={confirmLive}
              onChange={(ev) => setConfirmLive(ev.target.checked)}
            />
            실전 매도입니다. 건별 매도 버튼을 허용합니다.
          </label>
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
          {(account?.fxCash ?? []).map((cash) => (
            <span key={cash.currency}>
              {cash.currency} 예수금 {cash.currency === "USD" ? usd(cash.deposit) : (cash.deposit ?? "—")}
            </span>
          ))}
          <span>
            {rate != null ? `1달러 ${Math.round(rate).toLocaleString("ko-KR")}원` : "달러 환율 없음"}
          </span>
        </div>

        {rows.length ? (
          <div className="max-h-[62vh] overflow-auto rounded-md border border-[var(--workspace-border)]">
            <table className="w-full min-w-[980px] border-collapse text-left font-mono text-[12px]">
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
                  const lots = row.lots ?? [];
                  const datedLots = lots.filter((lot) => lot.date.length === 8).length;
                  const expanded = openLots[row.code] ?? datedLots >= 2;
                  return (
                    <Fragment key={row.code}>
                    <tr
                      className={cn(
                        "border-t border-[var(--workspace-border)]",
                        known && "cursor-pointer hover:bg-white/5"
                      )}
                      onClick={() => openSymbol(row.code)}
                    >
                      <td className="max-w-[180px] truncate px-2 py-1.5 text-[var(--workspace-fg)]" title={row.name}>
                        {lots.length > 0 && (
                          <button
                            type="button"
                            className="mr-1 rounded border border-[var(--workspace-border)] px-1 text-[11px]"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setOpenLots((prev) => ({ ...prev, [row.code]: !prev[row.code] }));
                            }}
                          >
                            {expanded ? "−" : "+"}
                          </button>
                        )}
                        {known?.nameKo || row.name}
                        <span className="ml-1 text-[10px] text-[var(--workspace-faint)]">{row.code}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right">{row.qty.toLocaleString("ko-KR")}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--workspace-muted)]">
                        {row.sellableQty.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {dualMoney(row.currency, row.avgPrice, row.krwAvgPrice, rate)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {dualMoney(row.currency, row.lastPrice, row.krwLastPrice, rate)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {dualMoney(row.currency, row.purchaseAmount, row.krwPurchaseAmount, rate)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {dualMoney(row.currency, row.evalAmount, row.krwEvalAmount, rate)}
                      </td>
                      <td className={cn("px-2 py-1.5 text-right", tone(row.pnl))}>
                        {dualMoney(row.currency, row.pnl, row.krwPnl, rate)}
                      </td>
                      <td className={cn("px-2 py-1.5 text-right", tone(row.returnPct))}>{pct(row.returnPct)}</td>
                      <td className="px-2 py-1.5 text-right text-[var(--workspace-muted)]">{share(row.weightPct)}</td>
                    </tr>
                    {expanded &&
                      lots.map((lot, index) => {
                        const ret =
                          row.lastPrice != null && lot.price > 0
                            ? ((row.lastPrice - lot.price) / lot.price) * 100
                            : null;
                        const buyAmt = lot.price * lot.qty;
                        const evalAmt = row.lastPrice != null ? row.lastPrice * lot.qty : null;
                        const pnlAmt = evalAmt != null ? evalAmt - buyAmt : null;
                        const won = (amount: number | null) =>
                          row.currency === "USD" && rate != null && amount != null ? amount * rate : null;
                        return (
                          <tr key={`${row.code}-${lot.date}-${lot.time ?? ""}-${index}`} className="border-t border-[var(--workspace-border)] bg-white/[0.02]">
                            <td className="px-2 py-1.5 pl-8 text-[11px] text-[var(--workspace-muted)]">{lotWhen(lot)}</td>
                            <td className="px-2 py-1.5 text-right">{lot.qty.toLocaleString("ko-KR")}</td>
                            <td />
                            <td className="px-2 py-1.5 text-right">
                              {row.currency === "USD" ? usd(lot.price) : krw(lot.price)}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {row.currency === "USD" ? usd(row.lastPrice) : krw(row.lastPrice)}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {dualMoney(row.currency, buyAmt, won(buyAmt), rate)}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              {dualMoney(row.currency, evalAmt, won(evalAmt), rate)}
                            </td>
                            <td className={cn("px-2 py-1.5 text-right", tone(pnlAmt))}>
                              {dualMoney(row.currency, pnlAmt, won(pnlAmt), rate)}
                            </td>
                            <td className={cn("px-2 py-1.5 text-right", tone(ret))}>{pct(ret)}</td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                type="button"
                                className="rounded border border-rose-400/40 px-2 py-0.5 text-[10px] text-rose-200 disabled:opacity-40"
                                disabled={live && !confirmLive}
                                onClick={() => void sellLot(row, lot.qty)}
                              >
                                매도
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
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
                  ? `계좌 ${account.accountNo}의 국내 잔고와 미국 원장잔고가 모두 비어 있습니다.`
                  : "국내 잔고와 미국 원장잔고가 모두 비어 있습니다."}
          </div>
        )}

        <p className="text-[10px] text-[var(--workspace-faint)]">
          계좌번호 10자리는 8자리 계좌에 상품코드 2자리가 붙은 값입니다. 10은 위탁종합입니다.
          국내 잔고는 kt00018, 미국 잔고는 원장잔고확인 ust21070, 원화 추정자산은 통화별 평가 ust21120입니다.
          미국 종목은 달러가 위, 키움이 환산한 원이 아래입니다. + 줄은 매수일별 수량과 금액입니다.
          {account?.historyNote ? ` ${account.historyNote}` : ""} 차트에 있는 종목을 누르면 그 차트로 이동합니다.
        </p>
      </DialogContent>
    </Dialog>
  );
}
