import { NextResponse } from "next/server";
import { readStore, upsertCustomIndicatorScript } from "@/lib/storage";

/** JS custom indicator — server mirror */
export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    scripts: store.customIndicatorScripts ?? [],
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    id?: string;
    name?: string;
    source?: string;
  };
  if (!body.name || !body.source) {
    return NextResponse.json(
      { error: "name and source required" },
      { status: 400 }
    );
  }
  const script = await upsertCustomIndicatorScript({
    id: body.id,
    name: body.name,
    source: body.source,
  });
  return NextResponse.json({ script });
}
