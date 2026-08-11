/**
 * POST /api/opencode/ws-call — called by the generated opencode custom tools
 * (see src/lib/opencode/toolgen.ts). Registers a pending workspace-function
 * call, streams it to the browser over SSE, and blocks until the browser
 * executes it against IndexedDB and posts the result back. The response body
 * is the tool result string the opencode tool returns to the model.
 *
 * Security: the request must carry the shared bridge secret
 * (`x-masarflow-bridge-secret` = MASARFLOW_BRIDGE_SECRET, baked into the
 * generated tool files). Only names from the workspace tool belt are
 * accepted — opencode can never reach anything else through this route.
 */

import { requestWorkspaceTool } from "@/lib/opencode/bridge";
import { WORKSPACE_TOOL_NAMES } from "@/lib/ai/workspace-tool-defs";

import { SESSION_ID_RE, badRequest, logRequest } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIMEOUT_MS = 120_000;

export async function POST(req: Request): Promise<Response> {
  const requestId = `ws_${crypto.randomUUID().slice(0, 8)}`;

  const secret = process.env.MASARFLOW_BRIDGE_SECRET;
  if (!secret) {
    logRequest(requestId, "bridge not configured", {});
    return Response.json(
      {
        error:
          "The MasarFlow tool bridge is not configured (MASARFLOW_BRIDGE_SECRET missing) — restart via npm run dev:full.",
      },
      { status: 503 },
    );
  }
  if (req.headers.get("x-masarflow-bridge-secret") !== secret) {
    logRequest(requestId, "unauthorized bridge call", {});
    return Response.json({ error: "Bridge secret mismatch." }, { status: 401 });
  }

  let body: { sessionId?: string; name?: string; args?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return badRequest("Invalid request body");
  }
  const { sessionId, name } = body;
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return badRequest("Missing or invalid sessionId");
  }
  if (!name || !WORKSPACE_TOOL_NAMES.includes(name)) {
    return badRequest(`Unknown tool: ${name}`);
  }
  const args =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {};

  logRequest(requestId, "workspace tool requested", {
    sessionId,
    tool: name,
    argKeys: Object.keys(args),
  });

  try {
    const result = await requestWorkspaceTool({
      sessionId,
      name,
      args,
      timeoutMs: TIMEOUT_MS,
    });
    logRequest(requestId, "workspace tool answered", {
      sessionId,
      tool: name,
      resultLength: result.length,
    });
    return Response.json({ ok: true, result });
  } catch (e) {
    logRequest(requestId, "workspace tool unresolved", {
      sessionId,
      tool: name,
      error: (e as Error).message,
    });
    return Response.json({ error: (e as Error).message }, { status: 504 });
  }
}
