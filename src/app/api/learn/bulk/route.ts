import { NextResponse } from "next/server";
import { learnFromPost } from "@/lib/learning";
import type { IngestMethod, PostCategory } from "@/lib/types";

const CATEGORIES: PostCategory[] = [
  "survival_strategy",
  "realtime_chart",
  "mindset",
  "insight",
];

function parseCategory(raw: unknown, fallback: PostCategory): PostCategory {
  if (typeof raw === "string" && CATEGORIES.includes(raw as PostCategory)) {
    return raw as PostCategory;
  }
  return fallback;
}

interface BulkItem {
  category?: PostCategory;
  title?: string;
  body?: string;
  content?: string;
  publishedAt?: string;
  externalUrl?: string;
  symbolIds?: string[];
  ingestMethod?: IngestMethod;
}

/**
 * Bulk Fanding/easychart import — JSON array of posts (no scrape).
 * Body: { posts: BulkItem[], defaultCategory?, autoOpinion?, autoPatterns? }
 * or a raw array of BulkItem.
 */
export async function POST(req: Request) {
  const raw = await req.json();
  const envelope = Array.isArray(raw)
    ? { posts: raw as BulkItem[] }
    : (raw as {
        posts?: BulkItem[];
        defaultCategory?: PostCategory;
        autoOpinion?: boolean;
        autoPatterns?: boolean;
      });

  const items = envelope.posts ?? [];
  if (!items.length) {
    return NextResponse.json(
      { error: "posts array required" },
      { status: 400 }
    );
  }

  const defaultCategory = parseCategory(
    envelope.defaultCategory,
    "realtime_chart"
  );
  const results = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const title = item.title?.trim();
    const body = (item.body ?? item.content)?.trim();
    if (!title || !body) {
      errors.push({ index: i, error: "title and body required" });
      continue;
    }
    try {
      const result = await learnFromPost({
        category: parseCategory(item.category, defaultCategory),
        title,
        body,
        publishedAt: item.publishedAt,
        externalUrl: item.externalUrl,
        symbolIds: item.symbolIds,
        ingestMethod: item.ingestMethod ?? "file_drop",
        autoOpinion: envelope.autoOpinion,
        autoPatterns: envelope.autoPatterns,
      });
      results.push(result);
    } catch (e) {
      errors.push({
        index: i,
        error: e instanceof Error ? e.message : "ingest failed",
      });
    }
  }

  return NextResponse.json(
    {
      imported: results.length,
      results,
      errors,
      posts: results.map((r) => r.post),
      patterns: results.flatMap((r) => r.patterns),
      opinions: results.flatMap((r) => r.opinions),
    },
    { status: results.length ? 200 : 400 }
  );
}
