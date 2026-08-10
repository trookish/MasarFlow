/**
 * POST /api/opencode/abort — stop an active AI response (Stop button).
 * Aborts the in-process turn AND the OpenCode session server-side, so the
 * model is not left generating in the background.
 *
 * Body: { sessionId }
 */

import { abortTurn } from "@/lib/opencode/turn";

import {
  SESSION_ID_RE,
  badRequest,
  client,
  logRequest,
  errorResponse,
} from "../_shared";

export async function POST(req: Request): Promise<Response> {
  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  if (!body.sessionId || !SESSION_ID_RE.test(body.sessionId)) {
    return badRequest("Missing or invalid sessionId");
  }
  const requestId = `abort_${crypto.randomUUID().slice(0, 8)}`;
  logRequest(requestId, "abort requested", { sessionId: body.sessionId });

  try {
    await abortTurn(body.sessionId, client());
    logRequest(requestId, "aborted", { sessionId: body.sessionId });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
