import { createMarketDataAdapter } from "@/lib/market-data";
import {
  draftOpinionWithOptionalLlm,
  shouldAutoEnqueueOpinion,
} from "@/lib/opinion-engine";
import {
  extractPatternsFromPost,
  toPendingPatternDef,
} from "@/lib/pattern-extractor";
import { extractSymbolsWithOptionalLlm } from "@/lib/symbol-extractor";
import {
  addAlert,
  addOpinion,
  addPattern,
  addPost,
  linkPatternSourcePost,
  readStore,
} from "@/lib/storage";
import { resolveLlmApiKey } from "@/lib/llm-env";
import type {
  IngestMethod,
  LearningStatus,
  Opinion,
  PatternDef,
  Post,
  PostCategory,
} from "@/lib/types";

export interface IngestPostInput {
  category: PostCategory;
  title: string;
  body: string;
  publishedAt?: string;
  externalUrl?: string;
  symbolIds?: string[];
  ingestMethod?: IngestMethod;
  autoOpinion?: boolean;
  autoPatterns?: boolean;
}

export interface LearnIngestResult {
  post: Post;
  opinions: Opinion[];
  patterns: PatternDef[];
}

function sameRules(a: PatternDef, b: { dsl?: string; name: string }): boolean {
  if (a.dsl && b.dsl && a.dsl === b.dsl) return true;
  return a.name === b.name;
}

/** Ingest one post: persist, extract patterns, draft opinions. */
export async function learnFromPost(
  input: IngestPostInput
): Promise<LearnIngestResult> {
  const store = await readStore();
  let symbolIds = input.symbolIds ?? [];
  if (!symbolIds.length) {
    const extracted = await extractSymbolsWithOptionalLlm(
      { title: input.title, body: input.body },
      store.symbols
    );
    symbolIds = extracted.symbolIds;
  }

  const post = await addPost({
    category: input.category,
    title: input.title,
    body: input.body,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    externalUrl: input.externalUrl ?? "",
    source: "fanding_easychart",
    ingestMethod: input.ingestMethod ?? "manual_paste",
    symbolIds,
  });

  const patterns: PatternDef[] = [];
  const autoPatterns = input.autoPatterns !== false;
  if (autoPatterns) {
    const drafts = await extractPatternsFromPost(post);
    const freshStore = await readStore();
    for (const draft of drafts) {
      const existing = freshStore.patterns.find((p) => sameRules(p, draft));
      if (existing) {
        const linked = await linkPatternSourcePost(existing.id, post.id);
        if (linked) patterns.push(linked);
        continue;
      }
      const created = await addPattern(
        toPendingPatternDef(draft, post.id, `pat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`)
      );
      patterns.push(created);
      await addAlert({
        type: "pattern",
        title: "새 패턴 검수 대기",
        message: `${created.name} — 원문「${post.title}」에서 추출`,
        patternId: created.id,
      });
    }
  }

  const opinions: Opinion[] = [];
  const auto =
    input.autoOpinion ?? shouldAutoEnqueueOpinion(input.category);
  if (auto && symbolIds.length) {
    const adapter = createMarketDataAdapter();
    const latest = await readStore();
    for (const symbolId of symbolIds) {
      const symbol = latest.symbols.find((s) => s.id === symbolId);
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

  return { post, opinions, patterns };
}

export async function getLearningStatus(): Promise<LearningStatus> {
  const store = await readStore();
  const postsByCategory = {
    survival_strategy: 0,
    realtime_chart: 0,
    mindset: 0,
    insight: 0,
  } as Record<PostCategory, number>;
  for (const p of store.posts) {
    postsByCategory[p.category] = (postsByCategory[p.category] ?? 0) + 1;
  }
  const pending = store.patterns.filter(
    (p) => (p.reviewStatus ?? "approved") === "pending"
  );
  const approved = store.patterns.filter(
    (p) => (p.reviewStatus ?? "approved") === "approved"
  );
  return {
    postsLearned: store.posts.length,
    postsByCategory,
    patternsDerived: store.patterns.filter((p) =>
      (p.sourcePostIds ?? []).length > 0
    ).length,
    patternsPendingReview: pending.length,
    patternsApproved: approved.length,
    opinionsDraft: store.opinions.filter((o) => o.status === "draft").length,
    opinionsApproved: store.opinions.filter((o) => o.status === "approved")
      .length,
    llmConfigured: Boolean(resolveLlmApiKey()),
  };
}
