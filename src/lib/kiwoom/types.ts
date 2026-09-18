/** Feature ID: trade.kiwoom — broker adapter contracts (mock first, OCX later). */

export type KiwoomOrderSide = "buy" | "sell";
export type KiwoomOrderType = "market" | "limit";

export interface KiwoomOrderRequest {
  /** ChartDesk symbol id */
  symbolId: string;
  /** Exchange ticker / 종목코드 e.g. 005930 */
  ticker: string;
  side: KiwoomOrderSide;
  type: KiwoomOrderType;
  qty: number;
  /** Limit price in KRW (ignored for market). */
  limitPrice?: number;
  /** Optional last quote for mock fills. */
  lastPrice?: number;
}

export interface KiwoomOrderResult {
  ok: boolean;
  mode: "mock" | "ocx";
  orderNo?: string;
  fillPrice?: number;
  message: string;
  /** Echo of paper account when mock fills against local ledger. */
  paperSynced?: boolean;
}

export interface KiwoomAdapterStatus {
  mode: "mock" | "ocx";
  label: string;
  ready: boolean;
  platform: string;
  notes: string[];
}

export interface KiwoomTradingAdapter {
  readonly id: string;
  readonly mode: "mock" | "ocx";
  status(): KiwoomAdapterStatus;
  placeOrder(req: KiwoomOrderRequest): Promise<KiwoomOrderResult>;
}
