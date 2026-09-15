import { NextResponse } from "next/server";
import type { WebhookConfig } from "@/lib/types";
import { readWebhookConfig, saveWebhookConfig } from "@/lib/storage";

/** Feature ID: alert.webhook */
export async function GET() {
  const config = await readWebhookConfig();
  return NextResponse.json({ webhookConfig: config });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as WebhookConfig;
  const webhookConfig = await saveWebhookConfig({
    url: body.url ?? "",
    enabled: Boolean(body.enabled),
  });
  return NextResponse.json({ webhookConfig });
}
