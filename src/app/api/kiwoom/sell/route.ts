import { NextResponse } from "next/server";
import {
  KiwoomQuoteError,
  kiwoomEndpoints,
  kiwoomQuotesConfigured,
} from "@/lib/kiwoom/quote-rest";
import { placeKiwoomUsSell } from "@/lib/kiwoom/rest-trade";

export const dynamic = "force-dynamic";

/** Sell one US lot at the market. Real host requires confirmLive. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    code?: string;
    qty?: number;
    stex?: "ND" | "NY" | "NA";
    confirmLive?: boolean;
  } | null;
  const live = kiwoomQuotesConfigured() && !kiwoomEndpoints().mock;
  if (!kiwoomQuotesConfigured()) {
    return NextResponse.json({ error: "키움 연결이 없습니다" }, { status: 400 });
  }
  if (live && body?.confirmLive !== true) {
    return NextResponse.json(
      { error: "실전 매도입니다. 확인을 체크한 뒤 전송하세요", live: true },
      { status: 400 }
    );
  }
  try {
    const order = await placeKiwoomUsSell({
      code: body?.code ?? "",
      qty: body?.qty ?? 0,
      stex: body?.stex === "NY" || body?.stex === "NA" ? body.stex : "ND",
    });
    return NextResponse.json({ ok: true, orderNo: order.orderNo, live });
  } catch (err) {
    const message = err instanceof KiwoomQuoteError ? err.message : "매도에 실패했습니다";
    return NextResponse.json({ error: message, live }, { status: 400 });
  }
}
