/**
 * POST /api/opencode/ws-call/result — the browser delivers the result of a
 * claimed workspace tool call. `result` is the JSON string produced by
 * executeWorkspaceTool; resolving it unblocks the pending opencode tool call.
 */

import {
  getPendingCall,
  rejectWorkspaceTool,
  resolveWorkspaceTool,
} from "@/lib/opencode/bridge";

import { SESSION_ID_RE, badRequest, logRequest } from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const requestId = `wsresult_${crypto.randomUUID().slice(0, 8)}`;

  let body: {
    correlationId?: string;
    sessionId?: string;
    result?: string;
    error?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid request body");
  }
  const { correlationId, sessionId } = body;
  if (typeof correlationId !== "string" || !correlationId) {
    return badRequest("Missing correlationId");
  }
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return badRequest("Missing or invalid sessionId");
  }

  const call = getPendingCall(correlationId);
  if (!call || call.sessionId !== sessionId) {
    logRequest(requestId, "result for unknown call", { correlationId });
    return Response.json({ ok: false }, { status: 404 });
  }

  if (typeof body.error === "string" && body.error) {
    rejectWorkspaceTool(correlationId, body.error);
    logRequest(requestId, "workspace tool failed in browser", {
      tool: call.name,
      error: body.error.slice(0, 200),
    });
  } else {
    resolveWorkspaceTool(
      correlationId,
      typeof body.result === "string" ? body.result : "",
    );
    logRequest(requestId, "workspace tool resolved", {
      tool: call.name,
      resultLength: (body.result ?? "").length,
    });
  }
  return Response.json({ ok: true });
}
