import { NextResponse } from "next/server";
import { learnFromPost } from "@/lib/learning";
import type { IngestMethod, PostCategory } from "@/lib/types";

const CATEGORIES: PostCategory[] = [
  "survival_strategy",
  "realtime_chart",
  "mindset",
  "insight",
];

function parseCategory(raw: string | null | undefined): PostCategory {
  if (raw && CATEGORIES.includes(raw as PostCategory)) {
    return raw as PostCategory;
  }
  return "realtime_chart";
}

/** Fanding ingest webhook — JSON body or plain text with ?category= (no scrape). */
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
      posts?: {
        category?: PostCategory;
        title?: string;
        body?: string;
        content?: string;
        externalUrl?: string;
        symbolIds?: string[];
      }[];
    };

    if (Array.isArray(body.posts) && body.posts.length) {
      const results = [];
      for (const item of body.posts) {
        const t = item.title?.trim();
        const b = (item.body ?? item.content)?.trim();
        if (!t || !b) continue;
        results.push(
          await learnFromPost({
            category: parseCategory(item.category ?? body.category),
            title: t,
            body: b,
            externalUrl: item.externalUrl,
            symbolIds: item.symbolIds,
            ingestMethod: "webhook",
            autoOpinion: true,
            autoPatterns: true,
          })
        );
      }
      return NextResponse.json(
        {
          accepted: true,
          imported: results.length,
          results,
          posts: results.map((r) => r.post),
          patterns: results.flatMap((r) => r.patterns),
          opinions: results.flatMap((r) => r.opinions),
          ingestMethod: "webhook" as IngestMethod,
        },
        { status: 202 }
      );
    }

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

  const ingestMethod: IngestMethod = "webhook";
  const result = await learnFromPost({
    category,
    title: title.trim(),
    body: bodyText.trim(),
    externalUrl: externalUrl.trim(),
    symbolIds,
    ingestMethod,
    autoOpinion: true,
    autoPatterns: true,
  });

  return NextResponse.json(
    { accepted: true, ...result, ingestMethod },
    { status: 202 }
  );
}
