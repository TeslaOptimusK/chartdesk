import { randomUUID } from "crypto";
import { readPaperAccount, savePaperAccount } from "@/lib/storage";
import type {
  KiwoomAdapterStatus,
  KiwoomOrderRequest,
  KiwoomOrderResult,
  KiwoomTradingAdapter,
} from "@/lib/kiwoom/types";
import type { PaperOrder } from "@/lib/types";

/**
 * Mock / paper Kiwoom adapter — works without 영웅문 or OCX.
 * Fills against optional lastPrice and mirrors into the local paper ledger.
 */
export class MockKiwoomAdapter implements KiwoomTradingAdapter {
  readonly id = "kiwoom-mock";
  readonly mode = "mock" as const;

  status(): KiwoomAdapterStatus {
    return {
      mode: "mock",
      label: "키움 모의 (로컬 페이퍼)",
      ready: true,
      platform: process.platform,
      notes: [
        "실계좌·영웅문 없이 매수/매도 체결 시뮬레이션",
        "체결은 ChartDesk paperAccount에 반영",
        "실주문은 KIWOOM_MODE=ocx + Windows OpenAPI+ 필요 (미구현 스텁)",
      ],
    };
  }

  async placeOrder(req: KiwoomOrderRequest): Promise<KiwoomOrderResult> {
    if (!req.symbolId || !req.qty || req.qty <= 0) {
      return {
        ok: false,
        mode: "mock",
        message: "종목과 수량을 확인하세요",
      };
    }

    const last = req.lastPrice ?? req.limitPrice ?? 100;
    const fillPrice =
      req.type === "limit" && req.limitPrice ? req.limitPrice : last;
    const cost = fillPrice * req.qty;
    const account = await readPaperAccount();

    if (req.side === "buy") {
      if (account.cash < cost) {
        return {
          ok: false,
          mode: "mock",
          message: `증거금 부족 (필요 ${cost.toFixed(0)}, 현금 ${account.cash.toFixed(0)})`,
        };
      }
      account.cash -= cost;
      const pos = account.positions.find((p) => p.symbolId === req.symbolId);
      if (pos) {
        const totalQty = pos.qty + req.qty;
        pos.avgCost = (pos.avgCost * pos.qty + cost) / totalQty;
        pos.qty = totalQty;
      } else {
        account.positions.push({
          symbolId: req.symbolId,
          qty: req.qty,
          avgCost: fillPrice,
        });
      }
    } else {
      const pos = account.positions.find((p) => p.symbolId === req.symbolId);
      if (!pos || pos.qty < req.qty) {
        return {
          ok: false,
          mode: "mock",
          message: "보유 수량 부족",
        };
      }
      pos.qty -= req.qty;
      account.cash += cost;
      if (pos.qty <= 0) {
        account.positions = account.positions.filter(
          (p) => p.symbolId !== req.symbolId
        );
      }
    }

    const orderNo = `KM${randomUUID().slice(0, 7).toUpperCase()}`;
    const order: PaperOrder = {
      id: `kiwoom_${orderNo}`,
      symbolId: req.symbolId,
      side: req.side,
      type: req.type,
      qty: req.qty,
      limitPrice: req.limitPrice,
      status: "filled",
      fillPrice,
      createdAt: new Date().toISOString(),
    };
    account.orders = [order, ...account.orders].slice(0, 100);
    await savePaperAccount(account);

    return {
      ok: true,
      mode: "mock",
      orderNo,
      fillPrice,
      paperSynced: true,
      message: `${req.side === "buy" ? "매수" : "매도"} 체결 (모의) ${req.ticker} × ${req.qty} @ ${fillPrice}`,
    };
  }
}
