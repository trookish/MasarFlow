/**
 * POST /api/opencode/ws-call/claim — the browser claims a pending workspace
 * tool call before executing it. The first tab to claim wins; others skip
 * execution so duplicate SSE subscriptions can never double-mutate.
 */

import { claimWorkspaceTool, getPendingCall } from "@/lib/opencode/bridge";

import { SESSION_ID_RE, badRequest, logRequest } from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const requestId = `wsclaim_${crypto.randomUUID().slice(0, 8)}`;

  let body: { correlationId?: string; sessionId?: string };
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
    logRequest(requestId, "claim for unknown call", { correlationId });
    return Response.json({ ok: false, claimed: false }, { status: 404 });
  }

  const claimed = claimWorkspaceTool(correlationId);
  logRequest(requestId, "claim result", {
    claimed,
    tool: call.name,
  });
  return Response.json({ ok: true, claimed });
}
