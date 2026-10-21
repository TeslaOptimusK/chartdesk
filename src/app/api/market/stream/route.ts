import { NextResponse } from "next/server";
import { resumeBracketWatcher } from "@/lib/kiwoom/brackets";
import { createMarketDataAdapter } from "@/lib/market-data";
import {
  createStreamClient,
  findStreamClient,
  registerStreamClient,
  unregisterStreamClient,
  type StreamMessage,
  type StreamSubscriptions,
} from "@/lib/market-data/stream-hub";
import { readStore } from "@/lib/storage";
import { ALL_TIMEFRAMES, type Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Opens the window's single market stream. Subscriptions arrive by POST with the streamId from `hello`. */
export async function GET(req: Request) {
  void resumeBracketWatcher();
  const adapter = createMarketDataAdapter();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let open = true;
      const send = (message: StreamMessage) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
        } catch {
          open = false;
        }
      };
      const client = createStreamClient({ adapter, send });
      registerStreamClient(client);
      send({ type: "hello", streamId: client.id, adapter: adapter.id });

      const keepAlive = setInterval(() => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          open = false;
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        open = false;
        clearInterval(keepAlive);
        client.close();
        unregisterStreamClient(client.id);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === "string" && (ALL_TIMEFRAMES as string[]).includes(value);
}

/** Replaces the stream's chart and quote subscriptions with the posted set. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    streamId?: string;
    charts?: { symbolId?: unknown; tf?: unknown }[];
    quotes?: { ids?: unknown; tf?: unknown } | null;
  } | null;
  const client = body?.streamId ? findStreamClient(body.streamId) : undefined;
  if (!client) {
    return NextResponse.json({ error: "unknown_stream" }, { status: 404 });
  }

  const next: StreamSubscriptions = {
    charts: (Array.isArray(body?.charts) ? body.charts : [])
      .filter(
        (row): row is { symbolId: string; tf: Timeframe } =>
          typeof row?.symbolId === "string" && isTimeframe(row.tf)
      )
      .map((row) => ({ symbolId: row.symbolId, tf: row.tf })),
    quotes:
      body?.quotes && Array.isArray(body.quotes.ids) && isTimeframe(body.quotes.tf)
        ? {
            ids: body.quotes.ids.filter((id): id is string => typeof id === "string"),
            tf: body.quotes.tf,
          }
        : null,
  };

  const store = await readStore();
  const symbols = new Map(store.symbols.map((symbol) => [symbol.id, symbol]));
  client.update(next, (symbolId) => symbols.get(symbolId));
  return NextResponse.json({ ok: true });
}
