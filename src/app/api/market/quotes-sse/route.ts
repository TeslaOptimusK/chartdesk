import { createMarketDataAdapter } from "@/lib/market-data";
import { readStore } from "@/lib/storage";
import type { Candle, Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Multiplexed SSE quotes for watchlist / header.
 * Query: ids=sym1,sym2&tf=1
 * Events: { type:"quote", symbolId, candle, prevClose }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idsRaw = searchParams.get("ids") ?? "";
  const tf = (searchParams.get("tf") ?? "1") as Timeframe;
  const ids = [...new Set(idsRaw.split(",").map((s) => s.trim()).filter(Boolean))];

  if (!ids.length) {
    return new Response("ids required", { status: 400 });
  }
  if (ids.length > 40) {
    return new Response("too many ids (max 40)", { status: 400 });
  }

  const store = await readStore();
  const adapter = createMarketDataAdapter();
  if (!adapter.subscribe) {
    return new Response("subscribe not supported", { status: 501 });
  }

  const symbols = ids
    .map((id) => store.symbols.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (!symbols.length) {
    return new Response("no symbols", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({
        type: "hello",
        ids: symbols.map((s) => s.id),
        tf,
        adapter: adapter.id,
      });

      const unsubs: Array<() => void> = [];
      const prevCloseById = new Map<string, number>();
      const liveById = new Map<string, boolean>();

      for (const symbol of symbols) {
        const query = {
          symbolId: symbol.id,
          ticker: symbol.ticker,
          exchange: symbol.exchange,
          assetClass: symbol.assetClass,
          timeframe: tf === "tick" ? ("1" as Timeframe) : tf,
          limit: 2,
        };

        // History is only a fallback before the shared forming bar emits.
        // A late snapshot must not overwrite a live tick (that was a second price).
        void adapter.getCandles({ ...query, limit: 2 }).then((bars) => {
          if (liveById.get(symbol.id)) return;
          const last = bars.at(-1);
          const prev = bars.length > 1 ? bars[bars.length - 2] : null;
          if (last) {
            prevCloseById.set(symbol.id, prev?.close ?? last.open);
            send({
              type: "quote",
              symbolId: symbol.id,
              candle: last,
              prevClose: prevCloseById.get(symbol.id),
            });
          }
        });

        const unsub = adapter.subscribe!(query, (candle: Candle) => {
          liveById.set(symbol.id, true);
          if (!prevCloseById.has(symbol.id)) {
            prevCloseById.set(symbol.id, candle.open);
          }
          const prevTime = prevCloseById.get(`${symbol.id}:bar`);
          if (prevTime != null && candle.time !== prevTime) {
            prevCloseById.set(symbol.id, candle.open);
          }
          send({
            type: "quote",
            symbolId: symbol.id,
            candle,
            prevClose: prevCloseById.get(symbol.id),
            barRoll: prevTime != null && candle.time !== prevTime,
          });
          prevCloseById.set(`${symbol.id}:bar`, candle.time);
        });
        unsubs.push(unsub);
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        for (const u of unsubs) u();
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
