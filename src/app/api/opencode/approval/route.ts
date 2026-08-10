/**
 * POST /api/opencode/approval — respond to an OpenCode permission request
 * (e.g. "run this command?" / "edit this file?"). The chat UI's ApprovalCard
 * drives this; responses map to OpenCode's permission reply semantics.
 *
 * Body: { sessionId, permissionId, response: "once" | "always" | "reject" }
 */

import {
  SESSION_ID_RE,
  badRequest,
  client,
  logRequest,
  errorResponse,
} from "../_shared";

const RESPONSES = new Set(["once", "always", "reject"]);

export async function POST(req: Request): Promise<Response> {
  let body: { sessionId?: string; permissionId?: string; response?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  if (!body.sessionId || !SESSION_ID_RE.test(body.sessionId)) {
    return badRequest("Missing or invalid sessionId");
  }
  if (!body.permissionId || body.permissionId.length > 128) {
    return badRequest("Missing or invalid permissionId");
  }
  if (!body.response || !RESPONSES.has(body.response)) {
    return badRequest('response must be "once", "always" or "reject"');
  }
  const requestId = `approval_${crypto.randomUUID().slice(0, 8)}`;
  logRequest(requestId, "approval reply", {
    sessionId: body.sessionId,
    permissionId: body.permissionId,
    response: body.response,
  });

  try {
    const ok = await client().respondPermission(
      body.sessionId,
      body.permissionId,
      body.response as "once" | "always" | "reject",
    );
    logRequest(requestId, "approval sent", { sessionId: body.sessionId, ok });
    return Response.json({ ok });
  } catch (e) {
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
