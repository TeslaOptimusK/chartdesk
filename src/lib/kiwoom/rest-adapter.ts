import { kiwoomEndpoints, kiwoomQuotesConfigured, KiwoomQuoteError } from "@/lib/kiwoom/quote-rest";
import type {
  KiwoomAdapterStatus,
  KiwoomOrderRequest,
  KiwoomOrderResult,
  KiwoomTradingAdapter,
} from "@/lib/kiwoom/types";
import { toKiwoomCode } from "@/lib/kiwoom/quote-protocol";
import { placeKiwoomCashOrder } from "@/lib/kiwoom/rest-trade";

export class RestKiwoomAdapter implements KiwoomTradingAdapter {
  readonly id = "kiwoom-rest";
  readonly mode = "rest" as const;

  status(): KiwoomAdapterStatus {
    const { mock } = kiwoomEndpoints();
    return {
      mode: "rest",
      label: mock ? "키움 모의 (REST)" : "키움 실전 (REST)",
      ready: kiwoomQuotesConfigured(),
      platform: process.platform,
      notes: [
        mock
          ? "모의투자 호스트로 계좌 조회와 주문을 보냅니다."
          : "실전 계좌입니다. 주문 전 확인 체크가 필요합니다.",
        "매수 목표가·손절은 보유 수량을 실시간 시세로 감시해 시장가 매도합니다.",
      ],
    };
  }

  async placeOrder(req: KiwoomOrderRequest): Promise<KiwoomOrderResult> {
    const code = toKiwoomCode(req.ticker);
    if (!code) {
      return { ok: false, mode: "rest", message: "키움 주문은 국내 6자리 종목만 가능합니다" };
    }
    if (req.type === "limit" && !(req.limitPrice && req.limitPrice > 0)) {
      return { ok: false, mode: "rest", message: "지정가를 입력하세요" };
    }
    try {
      const placed = await placeKiwoomCashOrder({
        side: req.side,
        code,
        qty: req.qty,
        price: req.type === "limit" ? req.limitPrice : undefined,
      });
      return {
        ok: true,
        mode: "rest",
        orderNo: placed.orderNo,
        message: `${req.side === "buy" ? "매수" : "매도"} 접수 ${placed.orderNo}`,
      };
    } catch (err) {
      const message = err instanceof KiwoomQuoteError ? err.message : "키움 주문에 실패했습니다";
      return { ok: false, mode: "rest", message };
    }
  }
}
