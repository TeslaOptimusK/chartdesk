import { createMarketDataAdapter } from "@/lib/market-data";
import { readStore } from "@/lib/storage";
import type { Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolId = searchParams.get("symbolId");
  const tf = (searchParams.get("tf") ?? "D") as Timeframe;

  if (!symbolId) {
    return new Response("symbolId required", { status: 400 });
  }

  const store = await readStore();
  const symbol = store.symbols.find((s) => s.id === symbolId);
  if (!symbol) {
    return new Response("symbol not found", { status: 404 });
  }

  const adapter = createMarketDataAdapter();
  const query = {
    symbolId: symbol.id,
    ticker: symbol.ticker,
    timeframe: tf === "tick" ? ("1" as Timeframe) : tf,
    limit: 2,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: "hello", symbolId, tf, adapter: adapter.id });

      if (!adapter.subscribe) {
        send({ type: "error", message: "subscribe not supported" });
        controller.close();
        return;
      }

      const unsub = adapter.subscribe(query, (candle) => {
        send({ type: "candle", candle });
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        unsub();
        controller.close();
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
