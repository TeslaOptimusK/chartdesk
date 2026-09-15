import { NextResponse } from "next/server";
import {
  addPriceWatchServer,
  readStore,
  savePriceWatches,
} from "@/lib/storage";
import type { PriceWatch, PriceWatchOp } from "@/lib/types";

/** Feature ID: alert.price — server-side watch CRUD */
export async function GET() {
  const store = await readStore();
  return NextResponse.json({ priceWatches: store.priceWatches ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    symbolId?: string;
    price?: number;
    op?: PriceWatchOp;
    message?: string;
  };
  if (!body.symbolId || body.price == null || !body.op) {
    return NextResponse.json(
      { error: "symbolId, price, op required" },
      { status: 400 }
    );
  }
  if (!["above", "below", "crossing"].includes(body.op)) {
    return NextResponse.json({ error: "invalid op" }, { status: 400 });
  }
  const watch = await addPriceWatchServer({
    symbolId: body.symbolId,
    price: body.price,
    op: body.op,
    message: body.message?.trim() || undefined,
  });
  return NextResponse.json({ priceWatch: watch });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { priceWatches?: PriceWatch[] };
  if (!Array.isArray(body.priceWatches)) {
    return NextResponse.json(
      { error: "priceWatches array required" },
      { status: 400 }
    );
  }
  const priceWatches = await savePriceWatches(body.priceWatches);
  return NextResponse.json({ priceWatches });
}
