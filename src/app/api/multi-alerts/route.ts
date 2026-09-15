import { NextResponse } from "next/server";
import {
  addMultiConditionAlert,
  readStore,
  saveMultiConditionAlerts,
} from "@/lib/storage";
import type { MultiAlertCondition, MultiAlertLogic } from "@/lib/types";

/** Feature ID: alert.multi_condition */
export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    multiConditionAlerts: store.multiConditionAlerts ?? [],
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    symbolId?: string;
    logic?: MultiAlertLogic;
    conditions?: MultiAlertCondition[];
    message?: string;
  };
  if (!body.symbolId || !body.logic || !body.conditions?.length) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  const alert = await addMultiConditionAlert({
    symbolId: body.symbolId,
    logic: body.logic,
    conditions: body.conditions,
    message: body.message?.trim() || undefined,
  });
  return NextResponse.json({ multiConditionAlert: alert });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as {
    multiConditionAlerts?: Awaited<
      ReturnType<typeof readStore>
    >["multiConditionAlerts"];
  };
  if (!Array.isArray(body.multiConditionAlerts)) {
    return NextResponse.json({ error: "array required" }, { status: 400 });
  }
  const multiConditionAlerts = await saveMultiConditionAlerts(
    body.multiConditionAlerts
  );
  return NextResponse.json({ multiConditionAlerts });
}
