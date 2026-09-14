import { NextResponse } from "next/server";
import { readStore, reviewOpinion } from "@/lib/storage";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const symbolId = searchParams.get("symbolId");
  const store = await readStore();
  let opinions = store.opinions;
  if (status) opinions = opinions.filter((o) => o.status === status);
  if (symbolId) opinions = opinions.filter((o) => o.symbolId === symbolId);
  return NextResponse.json({ opinions });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    status?: "approved" | "rejected";
  };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }
  const updated = await reviewOpinion(body.id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ opinion: updated });
}
