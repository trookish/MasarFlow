// Shared helper for the /api/python/* routes — thin proxies to the optional
// local Python AI service (python-service/). Not a route itself (no exported
// HTTP method handlers), so the Next.js router ignores this file.

import { getPythonServiceUrl } from "@/lib/python/service-url";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function serviceUrl(): URL {
  const raw = getPythonServiceUrl();
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

/** Unwrap node/undici fetch failures into a readable one-liner. */
export function describeError(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: unknown };
  if (err?.name === "TimeoutError") return "Timed out waiting for a response.";
  const cause = err?.cause as { code?: string; message?: string } | undefined;
  if (cause?.code) return `Connection failed (${cause.code}).`;
  return err?.message || "Unknown error.";
}
