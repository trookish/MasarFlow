/**
 * Browser-side client for MasarFlow's OpenCode chat endpoints (/api/opencode/*).
 * The browser never talks to the OpenCode server directly — everything goes
 * through the authenticated same-origin backend, which owns sessions,
 * streaming, approvals, and error classification.
 *
 * Event protocol (NDJSON lines, one JSON object per line):
 *   text | reasoning | tool_call | tool_running | tool_result | step | file |
 *   approval | notice | error | done | session_created | resumed | message_id
 */

import type { OpenCodeFrontendEvent } from "@/lib/opencode/types";

/** The user's turn was cancelled (Stop button). */
export class OpenCodeTurnAbortError extends Error {
  override name = "OpenCodeTurnAbortError";
}

/** The turn hit its overall deadline (no response or a wedged connection). */
export class OpenCodeTurnTimeoutError extends Error {
  override name = "OpenCodeTurnTimeoutError";
}

export interface OpenCodeModelsPayload {
  providers: {
    providerId: string;
    providerName: string;
    models: {
      id: string;
      name: string;
      capabilities: {
        reasoning: boolean;
        attachment: boolean;
        toolcall: boolean;
      };
    }[];
  }[];
  cached?: boolean;
  updatedAt?: number;
}

export interface SendTurnOptions {
  chatId: string;
  sessionId?: string;
  directory?: string;
  providerId?: string;
  modelId?: string;
  system?: string;
  text: string;
  attachments?: {
    name: string;
    mimeType: string;
    kind: "image" | "file";
    dataUrl?: string;
    textContent?: string;
  }[];
  toolsEnabled: boolean;
  /** Attach to an already-running turn after a page refresh. */
  resume?: boolean;
  requestId?: string;
  onEvent?: (event: OpenCodeFrontendEvent) => void;
  signal?: AbortSignal;
  idleTimeoutMs?: number;
  timeoutMs?: number;
}

function turnLog(message: string, extra: Record<string, unknown> = {}) {
  console.info(`[chat:opencode] ${message}`, JSON.stringify(extra));
}

/** Stream one chat turn through the backend; resolves when the stream ends. */
export async function sendTurn(opts: SendTurnOptions): Promise<void> {
  const deadlineMs = opts.timeoutMs ?? 300_000;
  const internal = new AbortController();
  const deadlineTimer = setTimeout(
    () => internal.abort(new Error("opencode-chat-timeout")),
    deadlineMs,
  );
  const onCallerAbort = () => internal.abort();
  if (opts.signal) {
    if (opts.signal.aborted) internal.abort();
    else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  const abortError = (): Error =>
    opts.signal?.aborted
      ? new OpenCodeTurnAbortError("Aborted")
      : new OpenCodeTurnTimeoutError(
          `The request took longer than ${Math.round(deadlineMs / 1000)}s and was stopped — Retry, or try a shorter prompt.`,
        );

  turnLog("turn started", {
    chatId: opts.chatId,
    resume: opts.resume ?? false,
  });

  try {
    const res = await fetch("/api/opencode/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatId: opts.chatId,
        sessionId: opts.sessionId,
        directory: opts.directory,
        providerId: opts.providerId,
        modelId: opts.modelId,
        system: opts.system,
        text: opts.text,
        attachments: opts.attachments,
        toolsEnabled: opts.toolsEnabled,
        resume: opts.resume,
        requestId: opts.requestId,
      }),
      signal: internal.signal,
    }).catch((e: unknown) => {
      if (e instanceof DOMException && e.name === "AbortError")
        throw abortError();
      throw e;
    });

    if (!res.ok || !res.body) {
      let message = `Request failed (${res.status})`;
      try {
        const j = await res.json();
        message = j.error ?? message;
      } catch {
        /* keep default */
      }
      throw new Error(message);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const idleMs = opts.idleTimeoutMs ?? 120_000;
    let buffer = "";
    let sawDone = false;

    const handle = (line: string) => {
      if (!line.trim()) return;
      let event: OpenCodeFrontendEvent;
      try {
        event = JSON.parse(line) as OpenCodeFrontendEvent;
      } catch {
        return;
      }
      if (event.type === "done") sawDone = true;
      opts.onEvent?.(event);
    };

    try {
      for (;;) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let readResult: ReadableStreamReadResult<Uint8Array>;
        try {
          readResult = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      `The AI stopped responding (no data for ${Math.round(idleMs / 1000)}s) — Retry to continue.`,
                    ),
                  ),
                idleMs,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        if (readResult.done) break;
        buffer += decoder.decode(readResult.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handle(line);
      }
      if (buffer) handle(buffer);
      if (!sawDone) {
        throw new Error(
          "The AI connection was interrupted — retry to continue.",
        );
      }
    } catch (e) {
      void reader.cancel().catch(() => {});
      turnLog("turn failed", { error: (e as Error).message });
      if (e instanceof DOMException && e.name === "AbortError")
        throw abortError();
      throw e;
    }

    turnLog("turn completed", { chatId: opts.chatId });
  } finally {
    clearTimeout(deadlineTimer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}

/** Create (or fetch) the OpenCode session backing a chat thread. */
export async function ensureChatSession(
  threadId: string,
  directory?: string,
): Promise<{ opencodeSessionId: string; created: boolean } | null> {
  const res = await fetch("/api/opencode/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId, directory }),
  });
  if (!res.ok) {
    let message = `Session request failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.error ?? message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  const data = (await res.json()) as {
    opencodeSessionId?: string;
    created?: boolean;
    error?: string;
  };
  if (!data.opencodeSessionId)
    throw new Error(data.error ?? "No session returned");
  return {
    opencodeSessionId: data.opencodeSessionId,
    created: data.created ?? false,
  };
}

/** Current status of a chat's OpenCode session (refresh recovery). */
export async function getChatState(
  sessionId: string,
): Promise<{ status: "idle" | "busy" | "missing" | "unknown" }> {
  try {
    const res = await fetch(
      `/api/opencode/state?sessionId=${encodeURIComponent(sessionId)}`,
    );
    if (!res.ok) return { status: "unknown" };
    const data = (await res.json()) as {
      status?: "idle" | "busy" | "missing" | "unknown";
    };
    return { status: data.status ?? "unknown" };
  } catch {
    return { status: "unknown" };
  }
}

/** Stop an active response (Stop button). */
export async function abortChatTurn(
  sessionId: string | undefined,
): Promise<void> {
  if (!sessionId) return;
  try {
    await fetch("/api/opencode/abort", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
  } catch {
    // Best effort — the backend's own watchdogs will stop the turn.
  }
}

/** Reply to an OpenCode permission request from the chat UI. */
export async function approvePermission(
  sessionId: string,
  permissionId: string,
  response: "once" | "always" | "reject",
): Promise<void> {
  const res = await fetch("/api/opencode/approval", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, permissionId, response }),
  });
  if (!res.ok) {
    let message = `Approval failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.error ?? message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
}

/**
 * Answer an opencode `question` request from the chat UI. `answers` is one
 * entry per asked question, each an array of selected labels.
 */
export async function answerQuestion(
  requestId: string,
  answers: string[][],
): Promise<void> {
  const res = await fetch("/api/opencode/question", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, action: "reply", answers }),
  });
  if (!res.ok) {
    let message = `Answer failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.error ?? message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
}

/** Dismiss an opencode `question` request unanswered. */
export async function rejectQuestion(requestId: string): Promise<void> {
  const res = await fetch("/api/opencode/question", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId, action: "reject" }),
  });
  if (!res.ok) {
    let message = `Dismiss failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.error ?? message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
}

/** Revert an assistant message's file changes via OpenCode's snapshot revert. */
export async function undoChatMessage(
  sessionId: string,
  messageId: string,
  partId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/opencode/undo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, messageID: messageId, partID: partId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok)
      return { ok: false, error: data.error ?? `Undo failed (${res.status})` };
    return { ok: data.ok ?? true };
  } catch {
    return { ok: false, error: "Could not reach the AI agent service." };
  }
}

/** Connected providers + models from the backend (cached browser-side). */
let modelsCache: { at: number; data: OpenCodeModelsPayload } | null = null;

export async function fetchOpenCodeModels(
  force = false,
): Promise<OpenCodeModelsPayload> {
  if (!force && modelsCache && Date.now() - modelsCache.at < 30_000)
    return modelsCache.data;
  const res = await fetch("/api/opencode/models", { cache: "no-store" });
  if (!res.ok) throw new Error("OpenCode unavailable");
  const data = (await res.json()) as OpenCodeModelsPayload;
  modelsCache = { at: Date.now(), data };
  return data;
}

/** Is the OpenCode server reachable? (drives the availability banner) */
export async function checkOpenCodeHealth(): Promise<{
  ok: boolean;
  version?: string;
}> {
  try {
    const res = await fetch("/api/opencode/health", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      version?: string;
    };
    return { ok: data.ok ?? false, version: data.version };
  } catch {
    return { ok: false };
  }
}

/** The tools the OpenCode server registers (names + descriptions). */
export interface OpenCodeToolInfo {
  id: string;
  description: string;
}

let toolsCache: { at: number; data: OpenCodeToolInfo[] } | null = null;

export async function fetchOpenCodeTools(
  force = false,
): Promise<OpenCodeToolInfo[]> {
  if (!force && toolsCache && Date.now() - toolsCache.at < 30_000)
    return toolsCache.data;
  const res = await fetch("/api/opencode/tools", { cache: "no-store" });
  if (!res.ok) throw new Error("OpenCode unavailable");
  const data = (await res.json()) as { tools?: OpenCodeToolInfo[] };
  toolsCache = { at: Date.now(), data: data.tools ?? [] };
  return toolsCache.data;
}

export type { OpenCodeFrontendEvent };

/* ── Workspace-tool bridge (opencode-executed project functions) ─────── */

/** A pending workspace-function call delivered to the browser over SSE. */
export interface BridgeWsToolCall {
  correlationId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface BridgeSubscriptionOptions {
  /** The opencode session whose calls this browser should answer. */
  sessionId: string;
  /** Called once per pending workspace-tool call (browser must answer it). */
  onCall: (call: BridgeWsToolCall) => void;
  /** Abort to stop subscribing (also stops reconnect attempts). */
  signal?: AbortSignal;
  /** Test seam. */
  fetchImpl?: typeof fetch;
}

/**
 * Subscribe to the workspace-tool bridge SSE stream for a session. The
 * browser executes each delivered call against IndexedDB, then posts the
 * result back via `postBridgeResult`. Auto-reconnects with backoff while the
 * signal is active; the caller must execute calls from `onCall` — exactly
 * one tab claims each call, so duplicates never double-mutate.
 */
export function subscribeBridge(opts: BridgeSubscriptionOptions): void {
  const { sessionId, onCall, signal } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  let closed = false;
  let retryMs = 1500;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  };
  if (signal) {
    if (signal.aborted) return;
    signal.addEventListener("abort", stop, { once: true });
  }

  const connect = async () => {
    if (closed || signal?.aborted) return;
    try {
      const res = await fetchImpl(
        `/api/opencode/bridge?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store", signal },
      );
      if (!res.ok || !res.body)
        throw new Error(`bridge failed (${res.status})`);
      retryMs = 1500; // a healthy connection resets the backoff
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        if (closed || signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          let event: {
            type?: string;
            correlationId?: string;
            name?: string;
            args?: Record<string, unknown>;
          };
          try {
            event = JSON.parse(line.slice(5).trim()) as typeof event;
          } catch {
            continue;
          }
          if (event.type === "ws_tool" && event.correlationId && event.name) {
            onCall({
              correlationId: event.correlationId,
              name: event.name,
              args: event.args ?? {},
            });
          }
        }
      }
    } catch {
      // Connection dropped (or abort) — reconnect unless stopped.
    }
    if (closed || signal?.aborted) return;
    timer = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 30_000);
  };

  void connect();
}

/** Claim a pending call so exactly one tab executes it. */
export async function claimBridgeCall(
  correlationId: string,
  sessionId: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/opencode/ws-call/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ correlationId, sessionId }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { claimed?: boolean };
    return data.claimed === true;
  } catch {
    return false;
  }
}

/** Deliver a workspace-tool result back to the pending opencode call. */
export async function postBridgeResult(
  correlationId: string,
  sessionId: string,
  result: string,
): Promise<void> {
  await fetch("/api/opencode/ws-call/result", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ correlationId, sessionId, result }),
  }).catch(() => {});
}

/** Report a browser-side execution failure for a pending call. */
export async function postBridgeError(
  correlationId: string,
  sessionId: string,
  error: string,
): Promise<void> {
  await fetch("/api/opencode/ws-call/result", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ correlationId, sessionId, error }),
  }).catch(() => {});
}
