/**
 * POST /api/opencode/session — create (or fetch) the OpenCode session backing
 * one chat thread. The browser stores only the returned session id; all
 * session state lives in OpenCode.
 *
 * Body: { threadId, directory?, providerId?, modelId?, title? }
 * Response: { threadId, opencodeSessionId, created }
 */

import { opencodeConfig } from "@/lib/opencode/config";
import { ensureSession } from "@/lib/opencode/sessions";

import {
  SESSION_ID_RE,
  THREAD_ID_RE,
  badRequest,
  client,
  logRequest,
  errorResponse,
} from "../_shared";

export async function POST(req: Request): Promise<Response> {
  let body: {
    threadId?: string;
    directory?: string;
    providerId?: string;
    modelId?: string;
    title?: string;
    opencodeSessionId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  if (!body.threadId || !THREAD_ID_RE.test(body.threadId)) {
    return badRequest("Missing or invalid threadId");
  }
  const requestId = `session_${crypto.randomUUID().slice(0, 8)}`;
  logRequest(requestId, "ensure session", {
    threadId: body.threadId,
    directory: body.directory,
  });

  const config = opencodeConfig();
  try {
    const result = await ensureSession(client(), body.opencodeSessionId, {
      directory: body.directory?.trim() || config.workspaceDir,
      title: body.title?.trim() || `MasarFlow · ${body.threadId}`,
      model:
        body.providerId && body.modelId
          ? { providerID: body.providerId, modelID: body.modelId }
          : undefined,
      config,
    });
    if (!result) {
      logRequest(requestId, "unavailable", { threadId: body.threadId });
      return Response.json(
        {
          error: "The AI agent service is unavailable — start it and retry.",
          kind: "unavailable",
        },
        { status: 503 },
      );
    }
    logRequest(
      requestId,
      result.created ? "session created" : "session reused",
      {
        sessionId: result.session.id,
        threadId: body.threadId,
      },
    );
    return Response.json({
      threadId: body.threadId,
      opencodeSessionId: result.session.id,
      directory: result.session.directory,
      created: result.created,
    });
  } catch (e) {
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}

/**
 * DELETE /api/opencode/session — best-effort removal of a chat's OpenCode
 * session (thread deletion). Query: ?sessionId=
 */
export async function DELETE(req: Request): Promise<Response> {
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
  if (!SESSION_ID_RE.test(sessionId))
    return badRequest("Missing or invalid sessionId");
  const requestId = `session_del_${crypto.randomUUID().slice(0, 8)}`;
  logRequest(requestId, "delete session", { sessionId });
  try {
    const ok = await client().deleteSession(sessionId);
    logRequest(requestId, "session deleted", { sessionId, ok });
    return Response.json({ ok });
  } catch (e) {
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
