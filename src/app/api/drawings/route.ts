import { NextResponse } from "next/server";
import { readStore, saveDrawings } from "@/lib/storage";
import type { Drawing } from "@/lib/types";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolId = searchParams.get("symbolId");
  const store = await readStore();
  const drawings = symbolId
    ? store.drawings.filter((d) => d.symbolId === symbolId)
    : store.drawings;
  return NextResponse.json({ drawings });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    symbolId?: string;
    drawings?: Drawing[];
  };
  if (!body.symbolId || !Array.isArray(body.drawings)) {
    return NextResponse.json(
      { error: "symbolId and drawings required" },
      { status: 400 }
    );
  }
  const drawings = await saveDrawings(body.symbolId, body.drawings);
  return NextResponse.json({ drawings });
}
