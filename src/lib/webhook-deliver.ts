import { promises as fs } from "fs";
import path from "path";
import type { AlertItem } from "@/lib/types";
import { readWebhookConfig } from "@/lib/storage";

const DATA_DIR = path.join(process.cwd(), "data");
const LOG_PATH = path.join(DATA_DIR, "webhook-log.json");

export interface WebhookLogEntry {
  at: string;
  reason: "disabled" | "missing_url" | "delivered" | "failed";
  alert: Pick<AlertItem, "id" | "type" | "title" | "message" | "symbolId">;
  firedAt: string;
  url?: string;
  status?: number;
  error?: string;
}

async function appendLog(entry: WebhookLogEntry): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let list: WebhookLogEntry[] = [];
  try {
    const raw = await fs.readFile(LOG_PATH, "utf8");
    list = JSON.parse(raw) as WebhookLogEntry[];
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }
  list.unshift(entry);
  await fs.writeFile(LOG_PATH, JSON.stringify(list.slice(0, 500), null, 2), "utf8");
}

async function postWithRetries(
  url: string,
  body: unknown,
  attempts = 3
): Promise<{ ok: boolean; status?: number; error?: string }> {
  let delay = 500;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true, status: res.status };
      if (i === attempts - 1) {
        return { ok: false, status: res.status, error: `HTTP ${res.status}` };
      }
    } catch (e) {
      if (i === attempts - 1) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "fetch failed",
        };
      }
    }
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
  return { ok: false, error: "exhausted retries" };
}

/** POST `{ alert, firedAt }` to configured webhook or log locally. */
export async function deliverAlertWebhook(alert: AlertItem): Promise<void> {
  const firedAt = alert.firedAt;
  const payload = { alert, firedAt };
  const config = await readWebhookConfig();

  if (!config.enabled) {
    console.info("[webhook] disabled — alert", alert.id, alert.title);
    await appendLog({
      at: new Date().toISOString(),
      reason: "disabled",
      alert: {
        id: alert.id,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        symbolId: alert.symbolId,
      },
      firedAt,
    });
    return;
  }

  const url = config.url?.trim();
  if (!url) {
    console.info("[webhook] no URL — alert", alert.id, alert.title);
    await appendLog({
      at: new Date().toISOString(),
      reason: "missing_url",
      alert: {
        id: alert.id,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        symbolId: alert.symbolId,
      },
      firedAt,
    });
    return;
  }

  const result = await postWithRetries(url, payload);
  if (result.ok) {
    await appendLog({
      at: new Date().toISOString(),
      reason: "delivered",
      alert: {
        id: alert.id,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        symbolId: alert.symbolId,
      },
      firedAt,
      url,
      status: result.status,
    });
  } else {
    console.warn("[webhook] delivery failed", result.error);
    await appendLog({
      at: new Date().toISOString(),
      reason: "failed",
      alert: {
        id: alert.id,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        symbolId: alert.symbolId,
      },
      firedAt,
      url,
      status: result.status,
      error: result.error,
    });
  }
}
