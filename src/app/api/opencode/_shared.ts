/**
 * Shared helpers for the /api/opencode/* routes: client factory, safe error
 * responses, and validation. Errors are classified server-side; the client
 * only ever receives friendly, secret-free messages.
 */

import { opencodeClient, type OpenCodeClient } from "@/lib/opencode";
import { OpenCodeError, safeDetail, userMessage } from "@/lib/opencode/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cachedClient: OpenCodeClient | null = null;

/** Process-wide client (stateless; config is read per request). */
export function client(): OpenCodeClient {
  if (!cachedClient) cachedClient = opencodeClient();
  return cachedClient;
}

export const THREAD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const SESSION_ID_RE = /^ses[A-Za-z0-9_-]{0,60}$/;

export interface RouteError {
  error: string;
  kind?: string;
  status?: number;
}

/**
 * Convert any thrown error into a safe JSON error response. Full details are
 * logged with the requestId; the client gets the friendly message only.
 */
export function errorResponse(
  err: unknown,
  requestId: string,
  log: (msg: string, extra?: Record<string, unknown>) => void,
): Response {
  let kind = "unknown";
  let status = 500;
  if (err instanceof OpenCodeError) {
    kind = err.kind;
    if (err.status) status = err.status;
    if (kind === "not_found") status = 404;
    if (kind === "session_busy" || kind === "rate_limit") status = 409;
    if (kind === "auth") status = 502;
    if (kind === "unavailable") status = 503;
    if (kind === "bad_request") status = 400;
  }
  log("request failed", {
    kind,
    status,
    error: safeDetail((err as Error)?.message ?? String(err)),
  });
  return Response.json(
    {
      error: userMessage(err),
      kind,
      requestId,
    } satisfies RouteError & { requestId: string },
    { status },
  );
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function logRequest(
  requestId: string,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  console.log(`[opencode:${requestId}] ${message}`, JSON.stringify(extra));
}
