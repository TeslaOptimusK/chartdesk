import { NextResponse } from "next/server";
import { learnFromPost } from "@/lib/learning";
import { readStore } from "@/lib/storage";
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
    autoPatterns?: boolean;
  };

  if (!body.category || !body.title || !body.body) {
    return NextResponse.json(
      { error: "category, title, body required" },
      { status: 400 }
    );
  }

  const result = await learnFromPost({
    category: body.category,
    title: body.title,
    body: body.body,
    publishedAt: body.publishedAt,
    externalUrl: body.externalUrl,
    symbolIds: body.symbolIds,
    ingestMethod: body.ingestMethod ?? "manual_paste",
    autoOpinion: body.autoOpinion,
    autoPatterns: body.autoPatterns,
  });

  return NextResponse.json(result);
}
