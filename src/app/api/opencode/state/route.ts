/**
 * GET /api/opencode/state — session status for refresh/navigation recovery.
 * The frontend asks "is the AI still working on this chat?" and either
 * attaches to the running turn (resume) or falls back to the interrupted UI.
 *
 * Query: ?sessionId=
 * Response: { status: "idle" | "busy" | "missing" | "unknown", session? }
 */

import type { SessionStatus } from "@/lib/opencode/types";

import {
  SESSION_ID_RE,
  badRequest,
  client,
  logRequest,
  errorResponse,
} from "../_shared";

export async function GET(req: Request): Promise<Response> {
  const sessionId = new URL(req.url).searchParams.get("sessionId") ?? "";
  if (!SESSION_ID_RE.test(sessionId))
    return badRequest("Missing or invalid sessionId");
  const requestId = `state_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const statuses = await client().sessionStatuses();
    const status: SessionStatus | undefined = statuses[sessionId];
    logRequest(requestId, "state", { sessionId, status: status?.type });

    // A session we are actively streaming for is busy even between events.
    if (status?.type === "busy" || status?.type === "retry") {
      return Response.json({ status: "busy", sessionStatus: status });
    }
    if (status?.type === "idle") {
      return Response.json({ status: "idle" });
    }
    // Unknown id — maybe the session was deleted or the server restarted.
    const session = await client().getSession(sessionId);
    if (!session) return Response.json({ status: "missing" });
    return Response.json({ status: "idle", session });
  } catch (e) {
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
