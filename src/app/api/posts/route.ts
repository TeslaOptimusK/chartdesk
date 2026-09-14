import { NextResponse } from "next/server";
import { createMarketDataAdapter } from "@/lib/market-data";
import { draftOpinionWithOptionalLlm, shouldAutoEnqueueOpinion } from "@/lib/opinion-engine";
import { extractSymbolsWithOptionalLlm } from "@/lib/symbol-extractor";
import { addAlert, addOpinion, addPost, readStore } from "@/lib/storage";
import type { IngestMethod, PostCategory } from "@/lib/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") as PostCategory | null;
  const store = await readStore();
  const posts = category
    ? store.posts.filter((p) => p.category === category)
    : store.posts;
  return NextResponse.json({ posts });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    category?: PostCategory;
    title?: string;
    body?: string;
    publishedAt?: string;
    externalUrl?: string;
    symbolIds?: string[];
    ingestMethod?: IngestMethod;
    autoOpinion?: boolean;
  };

  if (!body.category || !body.title || !body.body) {
    return NextResponse.json(
      { error: "category, title, body required" },
      { status: 400 }
    );
  }

  const store = await readStore();
  let symbolIds = body.symbolIds ?? [];
  if (!symbolIds.length) {
    const extracted = await extractSymbolsWithOptionalLlm(
      { title: body.title, body: body.body },
      store.symbols
    );
    symbolIds = extracted.symbolIds;
  }

  const post = await addPost({
    category: body.category,
    title: body.title,
    body: body.body,
    publishedAt: body.publishedAt ?? new Date().toISOString(),
    externalUrl: body.externalUrl ?? "",
    source: "fanding_easychart",
    ingestMethod: body.ingestMethod ?? "manual_paste",
    symbolIds,
  });

  const opinions = [];
  const auto =
    body.autoOpinion ?? shouldAutoEnqueueOpinion(body.category);
  if (auto && symbolIds.length) {
    const adapter = createMarketDataAdapter();
    for (const symbolId of symbolIds) {
      const symbol = store.symbols.find((s) => s.id === symbolId);
      if (!symbol) continue;
      const candles = await adapter.getCandles({
        symbolId,
        ticker: symbol.ticker,
        timeframe: "D",
        limit: 120,
      });
      const draft = await draftOpinionWithOptionalLlm({
        post,
        symbol,
        candles,
      });
      const opinion = await addOpinion(draft);
      opinions.push(opinion);
      await addAlert({
        type: "opinion",
        title: "새 의견 초안",
        message: `${opinion.summary} — 검수 대기`,
        symbolId,
        opinionId: opinion.id,
      });
    }
  } else if (auto && !symbolIds.length) {
    await addAlert({
      type: "opinion",
      title: "종목 미추출",
      message: `"${post.title}" — 수동 태깅이 필요합니다.`,
    });
  }

  return NextResponse.json({ post, opinions });
}
