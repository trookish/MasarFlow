// Shared helper for the /api/python/* routes — thin proxies to the optional
// local Python AI service (python-service/). Not a route itself (no exported
// HTTP method handlers), so the Next.js router ignores this file.

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const DEFAULT_URL = "http://127.0.0.1:8000";

function serviceUrl(): URL {
  const raw = process.env.PYTHON_SERVICE_URL?.trim() || DEFAULT_URL;
  const url = new URL(raw);
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error("PYTHON_SERVICE_URL must point at localhost / 127.0.0.1.");
  }
  return url;
}

/**
 * Forwards a request to the local Python service. Callers should catch and
 * turn failures into a graceful "service unavailable" response — the Python
 * service is optional, so a timeout/connection error here must never surface
 * as an app-breaking error to the browser.
 */
export async function proxyPython(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 5000, ...rest } = init ?? {};
  const url = new URL(path, serviceUrl());
  const res = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return res;
}
