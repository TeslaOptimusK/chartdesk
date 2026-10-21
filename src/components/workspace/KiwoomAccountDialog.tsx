"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
        <div className="whitespace-nowrap tabular-nums">{usd(native)}</div>
        <div className="whitespace-nowrap text-sm tabular-nums text-[var(--workspace-faint)]">{krw(wonAmount)}</div>
      </>
    );
  }
  return (
    <>
      <div className="whitespace-nowrap tabular-nums">{krw(native)}</div>
      <div className="whitespace-nowrap text-sm tabular-nums text-[var(--workspace-faint)]">{usd(krwToUsd(native ?? null, rate))}</div>
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

function mergeAccount(prev: AccountView | null, next: AccountView): AccountView {
  if (!prev) return next;
  const lotsByCode = new Map(prev.positions.map((row) => [row.code, row.lots]));
  return {
    ...next,
    historyNote: next.historyNote ?? prev.historyNote,
    positions: next.positions.map((row) => ({
      ...row,
      lots: row.lots?.length ? row.lots : lotsByCode.get(row.code),
    })),
  };
}

interface TradeCard {
  title: string;
  code: string;
  when: string;
  qty: number;
  entry: number | null;
  last: number | null;
  pnl: number | null;
  ret: number | null;
  currency?: string;
  symbolId: string | null;
}

function priceText(currency: string | undefined, value: number | null): string {
  if ((currency ?? "KRW") === "USD") return usd(value);
  return krw(value);
}

function tone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "text-[var(--workspace-fg)]";
  return value > 0 ? "text-emerald-400" : "text-rose-400";
}

function TradePnlCard({
  card,
  rate,
  onClose,
  onChart,
}: {
  card: TradeCard;
  rate: number | null;
  onClose: () => void;
  onChart: () => void;
}) {
  const up = (card.ret ?? 0) > 0;
  const down = (card.ret ?? 0) < 0;
  const color = up ? "text-emerald-300" : down ? "text-rose-300" : "text-white";
  const wash = up ? "bg-emerald-400/15" : down ? "bg-rose-400/15" : "bg-white/10";
  const glow = up
    ? "shadow-[0_0_90px_rgba(52,211,153,0.28)]"
    : down
      ? "shadow-[0_0_90px_rgba(251,113,133,0.28)]"
      : "";
  const won =
    card.currency === "USD" && rate != null && card.pnl != null ? card.pnl * rate : null;
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <article
        className={cn(
          "flex h-[min(760px,92%)] w-[min(390px,100%)] flex-col rounded-[28px] border border-white/10 bg-[#0b1220] px-6 py-7",
          glow
        )}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="text-sm tracking-[0.18em] text-white/45">CHARTDESK</div>
        <h2 className="mt-8 text-2xl font-semibold leading-tight text-white">{card.title}</h2>
        <p className="mt-1 font-mono text-sm text-white/50">
          {card.code} · {card.when}
        </p>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="text-sm text-white/55">수익률</div>
          <div className={cn("mt-3 font-mono text-7xl font-bold tabular-nums leading-none", color)}>
            {pct(card.ret)}
          </div>
          <div className={cn("mt-5 rounded-full px-5 py-2 text-center font-mono text-xl tabular-nums", wash, color)}>
            <div>{priceText(card.currency, card.pnl)}</div>
            {won != null && <div className="text-sm text-white/55">{krw(won)}</div>}
          </div>
        </div>
        <dl className="space-y-3 border-t border-white/10 pt-5 text-base">
          {[
            ["매수가", priceText(card.currency, card.entry)],
            ["현재가", priceText(card.currency, card.last)],
            ["수량", `${card.qty.toLocaleString("ko-KR")}주`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-white/50">{label}</dt>
              <dd className="font-mono tabular-nums text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex gap-2">
          {card.symbolId && (
            <button
              type="button"
              className="h-11 flex-1 rounded-full bg-white text-sm font-medium text-[#0b1220]"
              onClick={onChart}
            >
              차트로
            </button>
          )}
          <button
            type="button"
            className="h-11 flex-1 rounded-full border border-white/15 text-sm text-white/80"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </article>
    </div>
  );
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
    <div className="rounded-md border border-[var(--workspace-border)] px-4 py-3">
      <div className="text-sm text-[var(--workspace-faint)]">{label}</div>
      <div className={cn("mt-1 whitespace-nowrap font-mono text-2xl tabular-nums leading-none", emphasize === "pnl" && tone(amount))}>
        {krw(amount)}
      </div>
      <div className={cn("mt-1 font-mono text-base tabular-nums text-[var(--workspace-muted)]", emphasize === "pnl" && tone(amount))}>
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
  const [selling, setSelling] = useState(false);
  const [sellMsg, setSellMsg] = useState<string | null>(null);
  const [ipNotice, setIpNotice] = useState<string | null>(null);
  const [lotsPending, setLotsPending] = useState(false);
  const [tradeCard, setTradeCard] = useState<TradeCard | null>(null);
  const loadGen = useRef(0);
  const accountRef = useRef<AccountView | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setConfirmLive(false);
  }

  const noteOutboundIp = (data: AccountView) => {
    const ip = data.outboundIp;
    if (!ip || data.error) return;
    const key = "chartdesk.kiwoom-ip";
    const prev = window.localStorage.getItem(key);
    setIpNotice(
      prev && prev !== ip
        ? `접속 주소가 ${prev}에서 ${ip}로 바뀌었습니다. 키움 등록 목록에 새 주소가 없으면 다음 조회가 막힙니다.`
        : null
    );
    window.localStorage.setItem(key, ip);
  };

  const load = () => {
    const mine = ++loadGen.current;
    fetch("/api/kiwoom/account")
      .then(async (res) => (await res.json()) as AccountView)
      .then((data) => {
        if (mine !== loadGen.current) return;
        noteOutboundIp(data);
        const hadLots = (accountRef.current?.positions ?? []).some((row) => (row.lots?.length ?? 0) > 0);
        const next = mergeAccount(accountRef.current, data);
        accountRef.current = next;
        setAccount(next);
        if (data.mode !== "rest" || data.error) {
          setLotsPending(false);
          return;
        }
        if (!hadLots) setLotsPending(true);
        return fetch("/api/kiwoom/account?lots=1")
          .then(async (res) => (await res.json()) as AccountView)
          .then((detail) => {
            if (mine !== loadGen.current || detail.error) return;
            accountRef.current = detail;
            setAccount(detail);
          })
          .finally(() => {
            if (mine === loadGen.current) setLotsPending(false);
          });
      })
      .catch(() => {
        if (mine !== loadGen.current) return;
        accountRef.current = null;
        setAccount(null);
        setLotsPending(false);
      });
  };

  useEffect(() => {
    if (!open) return;
    load();
    const id = window.setInterval(load, 20000);
    return () => window.clearInterval(id);
  }, [open]);

  const sellLot = async (row: PositionRow, qty: number) => {
    if (selling) return;
    setSelling(true);
    setSellMsg(null);
    try {
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
    } catch {
      setSellMsg("네트워크 오류로 매도 결과를 받지 못했습니다. 계좌를 새로고침해 접수 여부를 확인하세요");
    } finally {
      setSelling(false);
    }
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
        className="relative flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-3 overflow-hidden border-[var(--workspace-border)] bg-[var(--workspace-panel)] p-6 text-base sm:max-w-[96vw]"
        data-feature="trade.kiwoom.account.panel"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            계좌 · 키움
            <span
              className={cn(
                "rounded px-2 py-0.5 text-sm font-medium",
                live ? "bg-rose-500/20 text-rose-300" : "bg-sky-500/20 text-sky-200"
              )}
            >
              {account == null ? "확인 중" : live ? "실전" : account.mode === "rest" ? "모의" : "로컬 모의"}
            </span>
            {account?.accountNo && (
              <span className="font-mono text-base font-normal text-[var(--workspace-muted)]">
                {account.accountNo}
              </span>
            )}
            <button type="button" className="ml-auto text-base font-normal text-[var(--workspace-muted)] underline" onClick={load}>
              새로고침
            </button>
          </DialogTitle>
        </DialogHeader>

        {account?.error && <div className="text-base text-rose-300">{account.error}</div>}
        {account?.outboundIp && (
          <div className="flex flex-wrap items-center gap-2 text-base text-[var(--workspace-fg)]">
            <span>
              이 PC 접속 주소 <span className="font-mono text-rose-200">{account.outboundIp}</span>
            </span>
            <button
              type="button"
              className="rounded border border-[var(--workspace-border)] px-2 py-0.5 text-sm"
              onClick={() => void navigator.clipboard.writeText(account.outboundIp ?? "")}
            >
              주소 복사
            </button>
            <span className="text-sm text-[var(--workspace-faint)]">
              키움은 등록된 주소만 허용하고, 집 IP는 바뀝니다. 바뀐 주소를 사용신청에 추가하세요.
            </span>
          </div>
        )}
        {ipNotice && <div className="text-base text-amber-200">{ipNotice}</div>}
        {sellMsg && <div className="text-base text-[var(--workspace-fg)]">{sellMsg}</div>}
        {live && (
          <label className="flex items-center gap-2 text-base text-rose-200">
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

        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-base tabular-nums text-[var(--workspace-muted)]">
          <span>총매입 {krw(account?.summary?.purchase)}</span>
          <span className={tone(account?.summary?.returnPct)}>
            총수익률 {pct(account?.summary?.returnPct)}
          </span>
          <span>주문가능 {krw(account?.orderable)}</span>
          <span>보유 {rows.length}종목</span>
          {lotsPending && <span>분할 매수 내역을 불러오는 중</span>}
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
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[var(--workspace-border)]">
            <table className="w-full table-fixed border-collapse text-left font-mono text-base tabular-nums">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[11%]" />
                <col className="w-[7%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead className="sticky top-0 bg-[var(--workspace-panel)] text-sm text-[var(--workspace-faint)]">
                <tr>
                  {["종목", "보유", "가능", "매수가", "현재가", "매입금액", "평가금액", "손익", "수익률", "비중"].map(
                    (label, index) => (
                      <th key={label} className={cn("whitespace-nowrap px-2 py-2 font-normal", index > 0 && "text-right")}>
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
                  const expanded = openLots[row.code] ?? datedLots >= 1;
                  return (
                    <Fragment key={row.code}>
                    <tr
                      className="cursor-pointer border-t border-[var(--workspace-border)] hover:bg-white/5"
                      onClick={() =>
                        setTradeCard({
                          title: known?.nameKo || row.name,
                          code: row.code,
                          when: "전체 보유",
                          qty: row.qty,
                          entry: row.avgPrice,
                          last: row.lastPrice,
                          pnl: row.pnl,
                          ret: row.returnPct,
                          currency: row.currency,
                          symbolId: known?.id ?? null,
                        })
                      }
                    >
                      <td className="truncate px-2 py-2 text-[var(--workspace-fg)]" title={row.name}>
                        {lots.length > 0 && (
                          <button
                            type="button"
                            className="mr-1 rounded border border-[var(--workspace-border)] px-1.5 text-sm"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setOpenLots((prev) => ({ ...prev, [row.code]: !prev[row.code] }));
                            }}
                          >
                            {expanded ? "−" : "+"}
                          </button>
                        )}
                        {known?.nameKo || row.name}
                        <span className="ml-1 text-sm text-[var(--workspace-faint)]">{row.code}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{row.qty.toLocaleString("ko-KR")}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-[var(--workspace-muted)]">
                        {row.sellableQty.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {dualMoney(row.currency, row.avgPrice, row.krwAvgPrice, rate)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {dualMoney(row.currency, row.lastPrice, row.krwLastPrice, rate)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {dualMoney(row.currency, row.purchaseAmount, row.krwPurchaseAmount, rate)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {dualMoney(row.currency, row.evalAmount, row.krwEvalAmount, rate)}
                      </td>
                      <td className={cn("px-2 py-2 text-right", tone(row.pnl))}>
                        {dualMoney(row.currency, row.pnl, row.krwPnl, rate)}
                      </td>
                      <td className={cn("whitespace-nowrap px-2 py-2 text-right", tone(row.returnPct))}>{pct(row.returnPct)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-[var(--workspace-muted)]">{share(row.weightPct)}</td>
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
                          <tr
                            key={`${row.code}-${lot.date}-${lot.time ?? ""}-${index}`}
                            className="cursor-pointer border-t border-[var(--workspace-border)] bg-white/[0.02] text-sm hover:bg-white/5"
                            onClick={() =>
                              setTradeCard({
                                title: known?.nameKo || row.name,
                                code: row.code,
                                when: lotWhen(lot),
                                qty: lot.qty,
                                entry: lot.price,
                                last: row.lastPrice,
                                pnl: pnlAmt,
                                ret,
                                currency: row.currency,
                                symbolId: known?.id ?? null,
                              })
                            }
                          >
                            <td className="truncate px-2 py-2 pl-6 text-[var(--workspace-muted)]">{lotWhen(lot)}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-right">{lot.qty.toLocaleString("ko-KR")}</td>
                            <td />
                            <td className="whitespace-nowrap px-2 py-2 text-right">
                              {row.currency === "USD" ? usd(lot.price) : krw(lot.price)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right">
                              {row.currency === "USD" ? usd(row.lastPrice) : krw(row.lastPrice)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {dualMoney(row.currency, buyAmt, won(buyAmt), rate)}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {dualMoney(row.currency, evalAmt, won(evalAmt), rate)}
                            </td>
                            <td className={cn("px-2 py-2 text-right", tone(pnlAmt))}>
                              {dualMoney(row.currency, pnlAmt, won(pnlAmt), rate)}
                            </td>
                            <td className={cn("whitespace-nowrap px-2 py-2 text-right", tone(ret))}>{pct(ret)}</td>
                            <td className="px-2 py-2 text-right">
                              <button
                                type="button"
                                className="rounded border border-rose-400/40 px-2 py-0.5 text-sm text-rose-200 disabled:opacity-40"
                                disabled={selling || (live && !confirmLive)}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  void sellLot(row, lot.qty);
                                }}
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
          <div className="text-base text-[var(--workspace-faint)]">
            {account == null
              ? "계좌를 불러오는 중"
              : account.error
                ? "계좌를 읽지 못했습니다"
                : account.accountNo
                  ? `계좌 ${account.accountNo}의 국내 잔고와 미국 원장잔고가 모두 비어 있습니다.`
                  : "국내 잔고와 미국 원장잔고가 모두 비어 있습니다."}
          </div>
        )}

        <p className="text-sm leading-relaxed text-[var(--workspace-faint)]">
          계좌번호 10자리는 8자리 계좌에 상품코드 2자리가 붙은 값입니다. 10은 위탁종합입니다.
          국내 잔고는 kt00018, 미국 잔고는 원장잔고확인 ust21070, 원화 추정자산은 통화별 평가 ust21120입니다.
          미국 종목은 달러가 위, 키움이 환산한 원이 아래입니다. 항목을 누르면 그 거래의 수익률 카드가 열립니다.
          {account?.historyNote ? ` ${account.historyNote}` : ""}
        </p>
        {tradeCard && (
          <TradePnlCard
            card={tradeCard}
            rate={rate}
            onClose={() => setTradeCard(null)}
            onChart={() => {
              if (tradeCard.symbolId) openSymbol(tradeCard.symbolId);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
