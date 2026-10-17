import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_HEADER, checkRequest, guardConfigFromEnv } from "@/lib/server/request-guard";

/**
 * Next 16 proxy (the renamed `middleware`). Enforcement is off unless Electron
 * main started this server with a launch token, so `next dev` in a plain
 * browser keeps working. The guard has no exempt paths — see request-guard.ts.
 */
export function proxy(request: NextRequest): NextResponse {
  const cfg = guardConfigFromEnv(process.env);
  if (!cfg) return NextResponse.next();
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
