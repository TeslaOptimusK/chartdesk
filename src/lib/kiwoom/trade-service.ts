import { armBracket, resumeBracketWatcher } from "@/lib/kiwoom/brackets";
import { MockKiwoomAdapter } from "@/lib/kiwoom/mock-adapter";
import { toKiwoomCode } from "@/lib/kiwoom/quote-protocol";
import { KiwoomQuoteError, kiwoomEndpoints, kiwoomQuotesConfigured } from "@/lib/kiwoom/quote-rest";
import { placeKiwoomCashOrder } from "@/lib/kiwoom/rest-trade";
import { buildScaleInOrders, roundToTick } from "@/lib/kiwoom/scale-plan";

export interface TradeRequest {
  symbolId: string;
  ticker: string;
  exchange?: string;
  assetClass?: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "scale";
  qty: number;
  limitPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  confirmLive?: boolean;
  /** Used only by the local paper adapter. */
  lastPrice?: number;
  scale?: { low: number; high: number; splits: number };
}

export interface PlacedSlice {
  price: number | null;
  qty: number;
  orderNo?: string;
}

export interface TradeResult {
  ok: boolean;
  live: boolean;
  message: string;
  orders: PlacedSlice[];
  bracketId?: string;
}

function optPrice(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return roundToTick(value);
}

function validateProtection(
  slices: { price: number }[],
  takeProfit: number | null,
  stopLoss: number | null
): string | null {
  if (takeProfit == null && stopLoss == null) return null;
  if (takeProfit != null && stopLoss != null && stopLoss >= takeProfit) {
    return "손절가는 목표가보다 낮아야 합니다";
  }
  if (slices.length === 0) return null;
  const highest = Math.max(...slices.map((s) => s.price));
  const lowest = Math.min(...slices.map((s) => s.price));
  if (stopLoss != null && stopLoss >= lowest) {
    return "손절가는 매수가보다 낮아야 합니다";
  }
  if (takeProfit != null && takeProfit <= highest) {
    return "목표가는 매수가보다 높아야 합니다";
  }
  return null;
}

export async function submitKiwoomTrade(req: TradeRequest): Promise<TradeResult> {
  const qty = Math.trunc(req.qty);
  if (!req.symbolId || qty <= 0) {
    return { ok: false, live: false, message: "종목과 수량을 확인하세요", orders: [] };
  }

  const takeProfit = req.side === "buy" ? optPrice(req.takeProfit) : null;
  const stopLoss = req.side === "buy" ? optPrice(req.stopLoss) : null;
  const liveHost = kiwoomQuotesConfigured() && !kiwoomEndpoints().mock;

  if (!kiwoomQuotesConfigured()) {
    return submitPaper(req, qty, takeProfit, stopLoss);
  }

  if (liveHost && req.confirmLive !== true) {
    return {
      ok: false,
      live: true,
      message: "실전 주문입니다. 확인을 체크한 뒤 전송하세요",
      orders: [],
    };
  }

  const code = toKiwoomCode(req.ticker, req.exchange, req.assetClass);
  if (!code) {
    return {
      ok: false,
      live: liveHost,
      message: "키움 주문은 국내 6자리 종목만 가능합니다",
      orders: [],
    };
  }

  try {
    if (req.type === "scale") {
      if (req.side !== "buy") {
        return { ok: false, live: liveHost, message: "분할매수는 매수만 가능합니다", orders: [] };
      }
      const scale = req.scale;
      if (!scale) {
        return { ok: false, live: liveHost, message: "분할 범위를 입력하세요", orders: [] };
      }
      const slices = buildScaleInOrders(scale.low, scale.high, scale.splits, qty);
      const protection = validateProtection(slices, takeProfit, stopLoss);
      if (protection) return { ok: false, live: liveHost, message: protection, orders: [] };

      const orders: PlacedSlice[] = [];
      for (const slice of slices) {
        try {
          const placed = await placeKiwoomCashOrder({
            side: "buy",
            code,
            qty: slice.qty,
            price: slice.price,
          });
          orders.push({ price: slice.price, qty: slice.qty, orderNo: placed.orderNo });
        } catch (err) {
          const detail = err instanceof Error ? err.message : "주문 실패";
          const message =
            orders.length === 0
              ? detail
              : `${orders.length}건 접수 후 중단: ${detail}`;
          return { ok: orders.length > 0, live: liveHost, message, orders };
        }
      }
      const bracketId = await maybeArm({
        symbolId: req.symbolId,
        code,
        qty: orders.reduce((sum, row) => sum + row.qty, 0),
        takeProfit,
        stopLoss,
        orderNos: orders
          .filter((row) => row.orderNo)
          .map((row) => ({ orderNo: row.orderNo!, qty: row.qty })),
      });
      return {
        ok: true,
        live: liveHost,
        message: `분할매수 ${orders.length}건 접수`,
        orders,
        bracketId,
      };
    }

    if (req.type === "limit" && !(req.limitPrice && req.limitPrice > 0)) {
      return { ok: false, live: liveHost, message: "지정가를 입력하세요", orders: [] };
    }
    const limit = req.type === "limit" ? roundToTick(req.limitPrice!) : null;
    const protection = validateProtection(
      limit != null ? [{ price: limit }] : [],
      takeProfit,
      stopLoss
    );
    if (protection) return { ok: false, live: liveHost, message: protection, orders: [] };

    const placed = await placeKiwoomCashOrder({
      side: req.side,
      code,
      qty,
      price: limit ?? undefined,
    });
    const orders: PlacedSlice[] = [{ price: limit, qty, orderNo: placed.orderNo }];
    const bracketId =
      req.side === "buy"
        ? await maybeArm({
            symbolId: req.symbolId,
            code,
            qty,
            takeProfit,
            stopLoss,
            orderNos: limit != null ? [{ orderNo: placed.orderNo, qty }] : [],
          })
        : undefined;
    return {
      ok: true,
      live: liveHost,
      message: `${req.side === "buy" ? "매수" : "매도"} 접수 ${placed.orderNo}`,
      orders,
      bracketId,
    };
  } catch (err) {
    if (err instanceof KiwoomQuoteError || err instanceof Error) {
      return { ok: false, live: liveHost, message: err.message, orders: [] };
    }
    return { ok: false, live: liveHost, message: "키움 주문에 실패했습니다", orders: [] };
  }
}

async function maybeArm(input: {
  symbolId: string;
  code: string;
  qty: number;
  takeProfit: number | null;
  stopLoss: number | null;
  orderNos: { orderNo: string; qty: number }[];
}): Promise<string | undefined> {
  if (input.takeProfit == null && input.stopLoss == null) return undefined;
  if (input.qty <= 0) return undefined;
  const bracket = await armBracket(input);
  await resumeBracketWatcher();
  return bracket.id;
}

async function submitPaper(
  req: TradeRequest,
  qty: number,
  takeProfit: number | null,
  stopLoss: number | null
): Promise<TradeResult> {
  const adapter = new MockKiwoomAdapter();
  if (req.type === "scale") {
    if (req.side !== "buy") {
      return { ok: false, live: false, message: "분할매수는 매수만 가능합니다", orders: [] };
    }
    if (!req.scale) {
      return { ok: false, live: false, message: "분할 범위를 입력하세요", orders: [] };
    }
    let slices;
    try {
      slices = buildScaleInOrders(req.scale.low, req.scale.high, req.scale.splits, qty);
    } catch (err) {
      return {
        ok: false,
        live: false,
        message: err instanceof Error ? err.message : "분할 입력을 확인하세요",
        orders: [],
      };
    }
    const protection = validateProtection(slices, takeProfit, stopLoss);
    if (protection) return { ok: false, live: false, message: protection, orders: [] };
    const orders: PlacedSlice[] = [];
    for (const slice of slices) {
      const result = await adapter.placeOrder({
        symbolId: req.symbolId,
        ticker: req.ticker,
        side: "buy",
        type: "limit",
        qty: slice.qty,
        limitPrice: slice.price,
        lastPrice: slice.price,
      });
      if (!result.ok) {
        return {
          ok: false,
          live: false,
          message: orders.length ? `${orders.length}건 체결 후 중단: ${result.message}` : result.message,
          orders,
        };
      }
      orders.push({ price: slice.price, qty: slice.qty, orderNo: result.orderNo });
    }
    const extra =
      takeProfit != null || stopLoss != null
        ? " 모의체결에는 목표가·손절 감시를 붙이지 않습니다."
        : "";
    return { ok: true, live: false, message: `모의 분할매수 ${orders.length}건.${extra}`, orders };
  }

  const result = await adapter.placeOrder({
    symbolId: req.symbolId,
    ticker: req.ticker,
    side: req.side,
    type: req.type === "limit" ? "limit" : "market",
    qty,
    limitPrice: req.limitPrice,
    lastPrice: req.lastPrice,
  });
  const extra =
    req.side === "buy" && (takeProfit != null || stopLoss != null)
      ? " 모의체결에는 목표가·손절 감시를 붙이지 않습니다."
      : "";
  return {
    ok: result.ok,
    live: false,
    message: `${result.message}${extra}`,
    orders: result.ok
      ? [{ price: result.fillPrice ?? req.limitPrice ?? null, qty, orderNo: result.orderNo }]
      : [],
  };
}
