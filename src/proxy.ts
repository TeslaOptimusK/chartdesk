import { NextResponse, type NextRequest } from "next/server";
import { requestBlockReason } from "@/lib/request-guard";

export function proxy(request: NextRequest) {
  const reason = requestBlockReason({
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    allowedHosts: process.env.CHARTDESK_ALLOWED_HOSTS,
  });
  if (reason) {
    return NextResponse.json({ error: reason }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
