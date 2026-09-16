import { NextResponse } from "next/server";
import { createMarketDataAdapter } from "@/lib/market-data";
import { draftOpinionWithOptionalLlm, shouldAutoEnqueueOpinion } from "@/lib/opinion-engine";
import { extractSymbolsWithOptionalLlm } from "@/lib/symbol-extractor";
import { addAlert, addOpinion, addPost, readStore } from "@/lib/storage";
import type { IngestMethod, PostCategory } from "@/lib/types";

const CATEGORIES: PostCategory[] = [
  "survival_strategy",
  "realtime_chart",
  "mindset",
  "insight",
];

function parseCategory(raw: string | null): PostCategory {
  if (raw && CATEGORIES.includes(raw as PostCategory)) {
    return raw as PostCategory;
  }
  return "realtime_chart";
}

/** Fanding ingest webhook — JSON body or plain text with ?category= */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const contentType = req.headers.get("content-type") ?? "";

  let category = parseCategory(searchParams.get("category"));
  let title = searchParams.get("title") ?? "";
  let bodyText = "";
  let externalUrl = searchParams.get("externalUrl") ?? "";
  let symbolIds: string[] | undefined;

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as {
      category?: PostCategory;
      title?: string;
      body?: string;
      externalUrl?: string;
      symbolIds?: string[];
    };
    if (body.category) category = parseCategory(body.category);
    title = body.title ?? title;
    bodyText = body.body ?? "";
    externalUrl = body.externalUrl ?? externalUrl;
    symbolIds = body.symbolIds;
  } else {
    bodyText = await req.text();
    if (!title) {
      const firstLine = bodyText.split(/\r?\n/).find((l) => l.trim()) ?? "";
      title = firstLine.slice(0, 120) || "Webhook ingest";
    }
  }

  if (!bodyText.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  if (!title.trim()) {
    title = "Webhook ingest";
  }

  const store = await readStore();
  let resolvedSymbolIds = symbolIds ?? [];
  if (!resolvedSymbolIds.length) {
    const extracted = await extractSymbolsWithOptionalLlm(
      { title, body: bodyText },
      store.symbols
    );
    resolvedSymbolIds = extracted.symbolIds;
  }

  const ingestMethod: IngestMethod = "webhook";
  const post = await addPost({
    category,
    title: title.trim(),
    body: bodyText.trim(),
    publishedAt: new Date().toISOString(),
    externalUrl: externalUrl.trim(),
    source: "fanding_easychart",
    ingestMethod,
    symbolIds: resolvedSymbolIds,
  });

  const opinions = [];
  const auto = shouldAutoEnqueueOpinion(category);
  if (auto && resolvedSymbolIds.length) {
    const adapter = createMarketDataAdapter();
    for (const symbolId of resolvedSymbolIds) {
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
        title: "새 의견 초안 (webhook)",
        message: `${opinion.summary} — 검수 대기`,
        symbolId,
        opinionId: opinion.id,
      });
    }
  }

  return NextResponse.json(
    { accepted: true, post, opinions, ingestMethod },
    { status: 202 }
  );
}
