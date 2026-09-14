import { NextResponse } from "next/server";
import { createMarketDataAdapter } from "@/lib/market-data";
import { matchAllPatterns, parsePatternDsl } from "@/lib/pattern-matcher";
import {
  addAlert,
  readStore,
  setPatternEnabled,
  setPatternFeedback,
  upsertPatternHits,
} from "@/lib/storage";
import type { Timeframe } from "@/lib/types";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    patterns: store.patterns,
    hits: store.patternHits,
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action?: "scan" | "feedback" | "toggle" | "parse-dsl";
    symbolId?: string;
    timeframe?: Timeframe;
    hitId?: string;
    feedback?: "correct" | "incorrect";
    patternId?: string;
    enabled?: boolean;
    dsl?: string;
  };

  if (body.action === "parse-dsl") {
    if (!body.dsl) {
      return NextResponse.json({ error: "dsl required" }, { status: 400 });
    }
    return NextResponse.json({ rules: parsePatternDsl(body.dsl) });
  }

  if (body.action === "toggle") {
    if (!body.patternId || body.enabled == null) {
      return NextResponse.json(
        { error: "patternId and enabled required" },
        { status: 400 }
      );
    }
    const pattern = await setPatternEnabled(body.patternId, body.enabled);
    return NextResponse.json({ pattern });
  }

  if (body.action === "feedback") {
    if (!body.hitId || !body.feedback) {
      return NextResponse.json(
        { error: "hitId and feedback required" },
        { status: 400 }
      );
    }
    const hit = await setPatternFeedback(body.hitId, body.feedback);
    return NextResponse.json({ hit });
  }

  // scan
  if (!body.symbolId) {
    return NextResponse.json({ error: "symbolId required" }, { status: 400 });
  }
  const timeframe = (body.timeframe ?? "D") as Timeframe;
  const store = await readStore();
  const symbol = store.symbols.find((s) => s.id === body.symbolId);
  if (!symbol) {
    return NextResponse.json({ error: "symbol not found" }, { status: 404 });
  }
  const adapter = createMarketDataAdapter();
  const candles = await adapter.getCandles({
    symbolId: symbol.id,
    ticker: symbol.ticker,
    timeframe,
    limit: 180,
  });
  const hits = matchAllPatterns(store.patterns, symbol, timeframe, candles);
  await upsertPatternHits(hits);
  for (const hit of hits) {
    await addAlert({
      type: "pattern",
      title: `패턴 탐지: ${hit.label}`,
      message: `${symbol.ticker} ${timeframe} — score ${hit.score.toFixed(2)}`,
      symbolId: symbol.id,
      patternId: hit.patternId,
    });
  }
  return NextResponse.json({ hits });
}
