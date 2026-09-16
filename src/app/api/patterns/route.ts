import { NextResponse } from "next/server";
import { createMarketDataAdapter } from "@/lib/market-data";
import { matchAllPatterns, parsePatternDsl } from "@/lib/pattern-matcher";
import {
  addAlert,
  readStore,
  reviewPattern,
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
    pendingReview: store.patterns.filter(
      (p) => (p.reviewStatus ?? "approved") === "pending"
    ),
  });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    patternId?: string;
    enabled?: boolean;
    reviewStatus?: "approved" | "rejected";
  };
  const id = body.id ?? body.patternId;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (body.reviewStatus === "approved" || body.reviewStatus === "rejected") {
    const pattern = await reviewPattern(id, body.reviewStatus);
    return NextResponse.json({ pattern });
  }
  if (body.enabled == null) {
    return NextResponse.json(
      { error: "enabled or reviewStatus required" },
      { status: 400 }
    );
  }
  const pattern = await setPatternEnabled(id, body.enabled);
  return NextResponse.json({ pattern });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action?: "scan" | "feedback" | "toggle" | "parse-dsl" | "review";
    symbolId?: string;
    timeframe?: Timeframe;
    hitId?: string;
    feedback?: "correct" | "incorrect";
    patternId?: string;
    enabled?: boolean;
    dsl?: string;
    reviewStatus?: "approved" | "rejected";
  };

  if (body.action === "parse-dsl") {
    if (!body.dsl) {
      return NextResponse.json({ error: "dsl required" }, { status: 400 });
    }
    return NextResponse.json({ rules: parsePatternDsl(body.dsl) });
  }

  if (body.action === "review") {
    if (
      !body.patternId ||
      (body.reviewStatus !== "approved" && body.reviewStatus !== "rejected")
    ) {
      return NextResponse.json(
        { error: "patternId and reviewStatus required" },
        { status: 400 }
      );
    }
    const pattern = await reviewPattern(body.patternId, body.reviewStatus);
    return NextResponse.json({ pattern });
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

  // scan — only enabled + approved patterns match via matchPattern.enabled
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
  const active = store.patterns.filter(
    (p) => p.enabled && (p.reviewStatus ?? "approved") !== "rejected"
  );
  const hits = matchAllPatterns(active, symbol, timeframe, candles);
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
