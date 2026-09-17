import { NextResponse } from "next/server";
import { readStore } from "@/lib/storage";

/** Bootstrap payload for the workspace client. */
export async function GET() {
  try {
    const store = await readStore();
    return NextResponse.json(store);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api/bootstrap]", message);
    return NextResponse.json(
      { error: "bootstrap_failed", message },
      { status: 500 }
    );
  }
}
