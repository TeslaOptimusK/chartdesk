import { NextResponse } from "next/server";
import { readStore, updateWatchlist } from "@/lib/storage";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const store = await readStore();
  const symbols = !q
    ? store.symbols
    : store.symbols.filter((s) => {
        const hay = [
          s.ticker,
          s.nameKo,
          s.nameEn,
          s.exchange,
          ...s.aliases,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  return NextResponse.json({ symbols, watchlist: store.watchlist });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { watchlist?: string[] };
  if (!Array.isArray(body.watchlist)) {
    return NextResponse.json({ error: "watchlist[] required" }, { status: 400 });
  }
  const store = await updateWatchlist(body.watchlist);
  return NextResponse.json({ watchlist: store.watchlist });
}
