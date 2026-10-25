import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_HEADER, checkDevRequest, checkRequest, guardConfigFromEnv } from "@/lib/server/request-guard";

/**
 * Next 16 proxy (the renamed `middleware`). Every mode is guarded:
 * - packaged app: Electron main supplies a launch token; Host, token and Origin are checked;
 * - browser development (no token): Host, Origin and Fetch Metadata are checked on `/api/*`.
 * The guard has no exempt paths — see request-guard.ts.
 */
export function proxy(request: NextRequest): NextResponse {
  const cfg = guardConfigFromEnv(process.env);
  if (!cfg) {
    const dev = checkDevRequest(
      { port: process.env.PORT?.trim() || "3000" },
      {
        method: request.method,
        pathname: request.nextUrl.pathname,
        host: request.headers.get("host"),
        origin: request.headers.get("origin"),
        token: null,
        fetchSite: request.headers.get("sec-fetch-site"),
      },
    );
    return dev.ok ? NextResponse.next() : NextResponse.json({ error: dev.reason }, { status: dev.status });
  }
  const result = checkRequest(cfg, {
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    token: request.headers.get(TOKEN_HEADER),
  });
  if (result.ok) return NextResponse.next();
  return NextResponse.json({ error: result.reason }, { status: result.status });
}

export const config = {
  // Static assets carry no data; everything else (pages, API routes) is guarded.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|models/|ort/).*)"],
};
