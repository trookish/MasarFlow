/**
 * POST /api/opencode/undo — revert an assistant message's file changes via
 * OpenCode's snapshot-based revert (the chat's "Undo" action).
 *
 * Body: { sessionId, messageID, partID? }
 */

import {
  SESSION_ID_RE,
  badRequest,
  client,
  logRequest,
  errorResponse,
} from "../_shared";

export async function POST(req: Request): Promise<Response> {
  let body: { sessionId?: string; messageID?: string; partID?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  if (!body.sessionId || !SESSION_ID_RE.test(body.sessionId)) {
    return badRequest("Missing or invalid sessionId");
  }
  if (!body.messageID || !/^msg[A-Za-z0-9_-]{0,60}$/.test(body.messageID)) {
    return badRequest("Missing or invalid messageID");
  }
  if (body.partID && !/^prt[A-Za-z0-9_-]{0,60}$/.test(body.partID)) {
    return badRequest("Invalid partID");
  }
  const requestId = `undo_${crypto.randomUUID().slice(0, 8)}`;
  logRequest(requestId, "undo requested", {
    sessionId: body.sessionId,
    messageID: body.messageID,
    partID: body.partID,
  });

  try {
    const ok = await client().revert(body.sessionId, {
      messageID: body.messageID,
      partID: body.partID || undefined,
    });
    logRequest(requestId, "undo done", { sessionId: body.sessionId, ok });
    return Response.json({ ok });
  } catch (e) {
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
