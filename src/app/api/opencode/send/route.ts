/**
 * POST /api/opencode/send — stream one chat turn as NDJSON. The browser
 * never talks to OpenCode directly: this route owns session repair, event
 * translation, watchdogs, and the terminal `done` event.
 *
 * Body: { chatId, sessionId?, directory?, providerId?, modelId?, agent?,
 *         system?, text, attachments?, toolsEnabled, resume?, requestId? }
 *
 * Response: application/x-ndjson — one frontend event per line:
 *   text | reasoning | tool_call | tool_running | tool_result | step | file |
 *   approval | notice | error | done | session_created | resumed
 */

import { opencodeConfig } from "@/lib/opencode/config";
import { runTurn, type TurnInput } from "@/lib/opencode/turn";
import type { OpenCodeFrontendEvent } from "@/lib/opencode/types";

import {
  SESSION_ID_RE,
  THREAD_ID_RE,
  badRequest,
  client,
  logRequest,
} from "../_shared";

const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson; charset=utf-8",
  "cache-control": "no-store",
  "x-accel-buffering": "no",
};

export async function POST(req: Request): Promise<Response> {
  let body: Partial<TurnInput> & { chatId?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  if (!body.chatId || !THREAD_ID_RE.test(body.chatId)) {
    return badRequest("Missing or invalid chatId");
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return badRequest("Missing message text");
  }
  if (body.sessionId && !SESSION_ID_RE.test(body.sessionId)) {
    return badRequest("Invalid sessionId");
  }
  if (body.sessionId && body.resume !== true && body.text.length > 200_000) {
    return badRequest("Message too long");
  }

  const requestId = body.requestId ?? `send_${crypto.randomUUID().slice(0, 8)}`;
  logRequest(requestId, "send", {
    chatId: body.chatId,
    sessionId: body.sessionId,
    resume: body.resume ?? false,
    textLength: body.text.length,
  });

  const config = opencodeConfig();
  const input: TurnInput = {
    chatId: body.chatId,
    sessionId: body.sessionId,
    directory: body.directory,
    providerId: body.providerId,
    modelId: body.modelId,
    agent: body.agent,
    system: body.system,
    text: body.text,
    attachments: body.attachments,
    toolsEnabled: body.toolsEnabled ?? true,
    requestId,
    resume: body.resume,
  };

  const stream = runTurn(client(), config, input);

  return new Response(stream, {
    headers: NDJSON_HEADERS,
    status: 200,
  });
}

export type { OpenCodeFrontendEvent };
