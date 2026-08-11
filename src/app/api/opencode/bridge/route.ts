/**
 * GET /api/opencode/bridge?sessionId=<id> — server-sent-events stream that
 * delivers pending workspace-tool calls for one opencode session to the
 * browser. The browser claims each call, executes it against IndexedDB, and
 * posts the result back to /api/opencode/ws-call/result.
 *
 * Frame protocol (one JSON object per `data:` line):
 *   { type: "connected", sessionId }          — initial frame
 *   { type: "ws_tool", correlationId, name, args } — a pending tool call
 *   { type: "heartbeat" }                     — every 20 s keepalive
 */

import { subscribeWorkspaceTools } from "@/lib/opencode/bridge";

import { SESSION_ID_RE, logRequest } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 20_000;

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store, no-transform",
  "x-accel-buffering": "no",
  connection: "keep-alive",
};

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    return new Response("invalid sessionId", { status: 400 });
  }
  const requestId = `wsbridge_${crypto.randomUUID().slice(0, 8)}`;
  logRequest(requestId, "bridge connected", { sessionId });

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };
      send({ type: "connected", sessionId });
      heartbeat = setInterval(() => send({ type: "heartbeat" }), HEARTBEAT_MS);
      unsubscribe = subscribeWorkspaceTools((call) => {
        if (call.sessionId === sessionId) {
          send({
            type: "ws_tool",
            correlationId: call.correlationId,
            name: call.name,
            args: call.args,
          });
        }
      });
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal?.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
