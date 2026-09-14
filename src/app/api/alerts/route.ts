import { NextResponse } from "next/server";
import { markAlertsRead, readStore, saveDrawings } from "@/lib/storage";
import type { Drawing } from "@/lib/types";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({ alerts: store.alerts });
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as { ids?: string[]; markAll?: boolean };
  const store = await markAlertsRead(body.markAll ? undefined : body.ids);
  return NextResponse.json({ alerts: store.alerts });
}

export async function PUT(req: Request) {
  // drawings persistence shared under alerts route group for simplicity
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
