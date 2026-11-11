import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_AUTH_COOKIE, LOCAL_AUTH_HEADER, readLocalAuthSecret } from "@/lib/local-auth";
import {
  brokerMutation,
  createRateLimiter,
  localAuthRequired,
  requestBlockReason,
  shouldIssueLocalCookie,
  tokenMatches,
} from "@/lib/request-guard";

const DENY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

/** Live order routes. Thirty calls a minute is enough for a scale-in ticket. */
const brokerLimiter = createRateLimiter(30, 60_000);

function deny(error: string, status = 403) {
  const response = NextResponse.json({ error }, { status });
  for (const [key, value] of Object.entries(DENY_HEADERS)) response.headers.set(key, value);
  return response;
}

export async function proxy(request: NextRequest) {
  const allowLan = process.env.CHARTDESK_ALLOW_LAN === "1";
  const pathname = request.nextUrl.pathname;
  const reason = requestBlockReason({
    method: request.method,
    pathname,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
    allowedHosts: process.env.CHARTDESK_ALLOWED_HOSTS,
    allowLan,
  });
  if (reason) return deny(reason);

  if (pathname === "/api/ingest/webhook") {
    const secret = process.env.CHARTDESK_WEBHOOK_SECRET?.trim() ?? "";
    if (secret) {
      const header = request.headers.get("x-chartdesk-webhook");
      const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
      if (!tokenMatches(header ?? bearer, secret)) return deny("webhook_auth");
    }
  }

  if (localAuthRequired(pathname)) {
    const secret = await readLocalAuthSecret();
    const presented =
      request.cookies.get(LOCAL_AUTH_COOKIE)?.value ?? request.headers.get(LOCAL_AUTH_HEADER);
    if (!tokenMatches(presented, secret)) return deny("local_auth");
  }

  if (brokerMutation(request.method, pathname) && !brokerLimiter(Date.now())) {
    return deny("rate_limited", 429);
  }

  const response = NextResponse.next();
  if (
    shouldIssueLocalCookie({
      method: request.method,
      pathname,
      accept: request.headers.get("accept"),
      fetchDest: request.headers.get("sec-fetch-dest"),
      fetchMode: request.headers.get("sec-fetch-mode"),
      fetchSite: request.headers.get("sec-fetch-site"),
    })
  ) {
    const secret = await readLocalAuthSecret();
    response.cookies.set(LOCAL_AUTH_COOKIE, secret, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
