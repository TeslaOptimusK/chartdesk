import { NextResponse } from "next/server";
import { listBrackets, resumeBracketWatcher } from "@/lib/kiwoom/brackets";
import { kiwoomBridgeClient, kiwoomBridgeOutboundIp } from "@/lib/kiwoom/bridge";
import {
  KiwoomQuoteError,
  kiwoomBrokerConfigured,
  kiwoomBrokerLive,
  kiwoomNeedsIpRegistration,
  lookupOutboundIp,
} from "@/lib/kiwoom/quote-rest";
import { fetchKiwoomAccount, fetchUsdKrw } from "@/lib/kiwoom/rest-trade";
import { readPaperAccount } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Current Kiwoom deposit, positions, and local TP/SL watches. Paper ledger when keys are absent. */
export async function GET(request: Request) {
  const lots = new URL(request.url).searchParams.get("lots") === "1";
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const marks = new URL(request.url).searchParams.get("marks") === "1" && !lots && !fresh;
  const viaBridge = kiwoomBridgeClient() != null;
  const configured = kiwoomBrokerConfigured();
  const via = viaBridge ? "minipc" : "direct";
  await resumeBracketWatcher().catch(() => undefined);
  const brackets = await listBrackets();

  if (!configured) {
    const paper = await readPaperAccount();
    return NextResponse.json({
      mode: "paper",
      live: false,
      via,
      deposit: paper.cash,
      orderable: paper.cash,
      summary: { purchase: null, evaluation: null, pnl: null, returnPct: null, estimatedAssets: null },
      usdKrw: null,
      positions: paper.positions.map((p) => ({
        code: p.symbolId,
        name: p.symbolId,
        qty: p.qty,
        sellableQty: p.qty,
        avgPrice: p.avgCost,
        lastPrice: null,
        pnl: null,
        returnPct: null,
      })),
      brackets: [],
    });
  }

  try {
    const [account, usdKrw, outboundIp] = await Promise.all([
      fetchKiwoomAccount({ lots, marks, fresh }),
      fetchUsdKrw(),
      viaBridge ? Promise.resolve(null) : lookupOutboundIp(),
    ]);
    return NextResponse.json({
      mode: "rest",
      live: kiwoomBrokerLive(),
      via,
      ...account,
      usdKrw,
      outboundIp: viaBridge ? kiwoomBridgeOutboundIp() : outboundIp,
      brackets: brackets.filter((b) => b.armed),
    });
  } catch (err) {
    const message =
      err instanceof KiwoomQuoteError
        ? err.message
        : err instanceof Error && err.message
          ? `계좌 조회에 실패했습니다 (${err.message.slice(0, 160)})`
          : "계좌 조회에 실패했습니다";
    const outboundIp = viaBridge
      ? kiwoomBridgeOutboundIp()
      : kiwoomNeedsIpRegistration(message)
        ? await lookupOutboundIp()
        : null;
    return NextResponse.json(
      {
        mode: "rest",
        live: kiwoomBrokerLive(),
        via,
        deposit: null,
        orderable: null,
        summary: { purchase: null, evaluation: null, pnl: null, returnPct: null, estimatedAssets: null },
        usdKrw: null,
        positions: [],
        brackets,
        error: message,
        outboundIp,
      },
      { status: 502 }
    );
  }
}
