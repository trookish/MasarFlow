/**
 * GET /api/opencode/history — normalized message list for a session
 * (reconstructing chat state after refresh/navigation).
 *
 * Query: ?sessionId=&limit=
 * Response: { messages: [{ info, parts }] }
 */

import {
  SESSION_ID_RE,
  badRequest,
  client,
  logRequest,
  errorResponse,
} from "../_shared";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
    : 50;
  if (!SESSION_ID_RE.test(sessionId))
    return badRequest("Missing or invalid sessionId");
  const requestId = `history_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const messages = await client().listMessages(sessionId, { limit });
    logRequest(requestId, "history fetched", {
      sessionId,
      count: messages.length,
    });
    return Response.json({ messages });
  } catch (e) {
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
