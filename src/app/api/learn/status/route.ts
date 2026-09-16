import { NextResponse } from "next/server";
import { getLearningStatus } from "@/lib/learning";

export async function GET() {
  const status = await getLearningStatus();
  return NextResponse.json({ status });
}
