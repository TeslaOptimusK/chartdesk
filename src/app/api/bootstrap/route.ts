import { NextResponse } from "next/server";
import { readStore } from "@/lib/storage";

/** Bootstrap payload for the workspace client. */
export async function GET() {
  const store = await readStore();
  return NextResponse.json(store);
}
