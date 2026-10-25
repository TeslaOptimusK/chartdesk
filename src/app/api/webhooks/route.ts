import { NextResponse } from "next/server";
import type { WebhookConfig } from "@/lib/types";
import { readWebhookConfig, saveWebhookConfig } from "@/lib/storage";
import { webhookUrlBlockReason } from "@/lib/webhook-url";

/** Feature ID: alert.webhook */
export async function GET() {
  const config = await readWebhookConfig();
  return NextResponse.json({ webhookConfig: config });
}

export async function PUT(req: Request) {
  let body: WebhookConfig;
  try {
    body = (await req.json()) as WebhookConfig;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const blocked = webhookUrlBlockReason(body.url);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
  const webhookConfig = await saveWebhookConfig({
    url: body.url ?? "",
    enabled: Boolean(body.enabled),
  });
  return NextResponse.json({ webhookConfig });
}
