import { NextResponse } from "next/server";
import { listBrackets, resumeBracketWatcher } from "@/lib/kiwoom/brackets";
import { KiwoomQuoteError, kiwoomEndpoints, kiwoomQuotesConfigured } from "@/lib/kiwoom/quote-rest";
import { fetchKiwoomAccount } from "@/lib/kiwoom/rest-trade";
import { readPaperAccount } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Current Kiwoom deposit, positions, and local TP/SL watches. Paper ledger when keys are absent. */
export async function GET() {
  const configured = kiwoomQuotesConfigured();
  const live = configured && !kiwoomEndpoints().mock;
  await resumeBracketWatcher().catch(() => undefined);
  const brackets = await listBrackets();

  if (!configured) {
    const paper = await readPaperAccount();
    return NextResponse.json({
      mode: "paper",
      live: false,
      deposit: paper.cash,
      orderable: paper.cash,
      summary: { purchase: null, evaluation: null, pnl: null, returnPct: null },
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
    const account = await fetchKiwoomAccount();
    return NextResponse.json({
      mode: "rest",
      live,
      ...account,
      brackets: brackets.filter((b) => b.armed),
    });
  } catch (err) {
    const message = err instanceof KiwoomQuoteError ? err.message : "계좌 조회에 실패했습니다";
    return NextResponse.json(
      {
        mode: "rest",
        live,
        deposit: null,
        orderable: null,
        summary: { purchase: null, evaluation: null, pnl: null, returnPct: null },
        positions: [],
        brackets,
        error: message,
      },
      { status: 502 }
    );
  }
}
