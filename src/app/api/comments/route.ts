import { NextResponse } from "next/server";
import { addComment, readStore } from "@/lib/storage";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    comments: store.comments ?? [],
    news: store.news ?? [],
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    symbolId?: string;
    body?: string;
    author?: string;
  };
  if (!body.symbolId || !body.body?.trim()) {
    return NextResponse.json(
      { error: "symbolId and body required" },
      { status: 400 }
    );
  }
  const comment = await addComment({
    symbolId: body.symbolId,
    body: body.body.trim(),
    author: body.author?.trim() || "나",
  });
  return NextResponse.json({ comment });
}
