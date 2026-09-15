import { NextResponse } from "next/server";
import type { TechnicalAlert } from "@/lib/types";
import {
  addTechnicalAlert,
  readStore,
  saveTechnicalAlerts,
} from "@/lib/storage";

/** Feature ID: alert.technical.drawing / alert.technical.indicator */
export async function GET() {
  const store = await readStore();
  return NextResponse.json({ technicalAlerts: store.technicalAlerts ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Omit<
    TechnicalAlert,
    "id" | "createdAt" | "triggered"
  >;
  if (!body.symbolId || !body.targetId || !body.kind) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const technicalAlert = await addTechnicalAlert({
    kind: body.kind,
    symbolId: body.symbolId,
    targetId: body.targetId,
    label: body.label ?? body.targetId,
    message: body.message,
  });
  return NextResponse.json({ technicalAlert });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { technicalAlerts: TechnicalAlert[] };
  const technicalAlerts = await saveTechnicalAlerts(body.technicalAlerts ?? []);
  return NextResponse.json({ technicalAlerts });
}
