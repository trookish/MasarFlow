import {
  providerFormat,
  providerBaseUrl,
  type AiProvider,
  type ProviderConnection,
} from "./catalog";
import type { WorkspaceToolDef, ToolCallRequest } from "./tools";

/**
 * Client for the /api/chat proxy. The proxy streams NDJSON events; this module
 * parses them and (for tool-enabled sessions) runs the agentic loop: execute
 * the model's tool calls locally, hand the results back, repeat until the
 * model stops calling tools.
 */

export interface WireImage {
  mimeType: string;
  /** Raw base64 payload (no data: prefix). */
  data: string;
}

export type WireMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string;
      toolCalls?: ToolCallRequest[];
      /** Images attached to a user turn (multimodal models only). */
      images?: WireImage[];
    }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      content: string;
    }
  | { type: "notice"; message: string }
  /** Mid-stream failure reported by the proxy (e.g. upstream went silent). */
  | { type: "error"; message: string }
  | { type: "round"; round: number }
  | { type: "done"; stopReason: "end" | "tool_calls" };

/** The turn was cancelled by the caller's signal (user pressed Stop). */
export class ChatAbortError extends Error {
  override name = "ChatAbortError";
}

/** The turn hit the overall deadline (no response, or a wedged connection). */
export class ChatTimeoutError extends Error {
  override name = "ChatTimeoutError";
}

/**
 * Turn-level lifecycle — always on, a handful of lines per turn so a frozen
 * turn is diagnosable from the browser console alone (request started →
 * first chunk → rounds/tools → completed/failed/cancelled).
 */
function turnLog(message: string, extra: Record<string, unknown> = {}) {
  console.info(`[chat] ${message}`, JSON.stringify(extra));
}

export interface StreamTurnOptions {
  provider: ProviderConnection;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: WireMessage[];
  tools?: WorkspaceToolDef[];
  /** Tool-calling mode when tools are present (default "auto"). */
  toolChoice?: "auto" | "required" | "none";
  /** Reasoning/thinking controls forwarded to /api/chat. */
  reasoning?: { enabled: boolean; budget?: number };
  /**
   * Client-generated id correlating this proxy request with its agent run —
   * echoed in the server logs as [chat:…].
   */
  requestId?: string;
  onEvent?: (event: StreamEvent) => void;
  signal?: AbortSignal;
  /**
   * Max milliseconds of silence from the server before the turn is failed
   * (default 90s — deliberately above the proxy's own 60s watchdog so the
   * proxy's clearer error event normally arrives first). Backstop for a
   * dead/buffered connection between this client and the proxy.
   */
  idleTimeoutMs?: number;
  /**
   * Overall deadline for the whole turn, including the time before response
   * headers arrive (default 180s). Unlike `idleTimeoutMs` this also covers a
   * proxy that is stuck retrying upstream — the fetch itself has no native
   * timeout, so without this a dead turn would spin forever.
   */
  timeoutMs?: number;
}

export interface TurnResult {
  text: string;
  reasoning: string;
  toolCalls: ToolCallRequest[];
  stopReason: "end" | "tool_calls";
}

/** Stream one model turn through /api/chat, resolving with the full result. */
export async function streamTurn(opts: StreamTurnOptions): Promise<TurnResult> {
  const deadlineMs = opts.timeoutMs ?? 180_000;
  // Internal controller drives the actual fetch: the total-deadline timeout
  // aborts it, and the caller's signal is forwarded into it. The caller's
  // own signal is never aborted by us, so it can tell a real user
  // cancellation (ChatAbortError) apart from a timeout (ChatTimeoutError).
  const internal = new AbortController();
  const deadlineTimer = setTimeout(
    () => internal.abort(new Error("chat-timeout")),
    deadlineMs,
  );
  const onCallerAbort = () => internal.abort();
  if (opts.signal) {
    if (opts.signal.aborted) internal.abort();
    else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  const abortError = (): Error =>
    opts.signal?.aborted
      ? new ChatAbortError("Aborted")
      : new ChatTimeoutError(
          `The request took longer than ${Math.round(deadlineMs / 1000)}s and was stopped — Retry, or try a shorter prompt.`,
        );

  turnLog("turn started", {
    model: opts.model,
    format: providerFormat(opts.provider),
  });

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format: providerFormat(opts.provider),
        baseUrl: opts.baseUrl?.trim() || providerBaseUrl(opts.provider),
        apiKey: opts.apiKey,
        noAuth: opts.provider.noAuth,
        model: opts.model,
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        toolChoice: opts.toolChoice,
        reasoning: opts.reasoning,
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
    const idleMs = opts.idleTimeoutMs ?? 90_000;
    let buffer = "";
    let text = "";
    let reasoning = "";
    const toolCalls: ToolCallRequest[] = [];
    let stopReason: "end" | "tool_calls" = "end";
    let sentFirst = false;

    const handle = (line: string) => {
      if (!line.trim()) return;
      let event: StreamEvent;
      try {
        event = JSON.parse(line) as StreamEvent;
      } catch {
        return;
      }
      // The proxy reports mid-stream failures as events — turn them into
      // thrown errors so callers land in their normal error handling (and
      // partial tool calls never execute).
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "text") {
        text += event.text;
        if (!sentFirst) {
          sentFirst = true;
          turnLog("first chunk received");
        }
      } else if (event.type === "reasoning") reasoning += event.text;
      else if (event.type === "tool_call") {
        toolCalls.push({
          id: event.id,
          name: event.name,
          arguments: event.arguments,
        });
      } else if (event.type === "done") stopReason = event.stopReason;
      opts.onEvent?.(event);
    };

    try {
      for (;;) {
        // Silence watchdog: any received bytes reset the timer. Fires only
        // when the connection is truly dead or wedged — the proxy's own
        // watchdogs normally end a stalled turn cleanly before this trips.
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
                      `The provider stopped responding (no data for ${Math.round(idleMs / 1000)}s) — Retry to continue.`,
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
    } catch (e) {
      // Free the connection on errors (error events, stalls, aborts).
      void reader.cancel().catch(() => {});
      turnLog("turn failed", { error: (e as Error).message });
      if (e instanceof DOMException && e.name === "AbortError") {
        throw abortError();
      }
      throw e;
    }

    turnLog("turn completed", { stopReason, textLength: text.length });
    return { text, reasoning, toolCalls, stopReason };
  } finally {
    clearTimeout(deadlineTimer);
    opts.signal?.removeEventListener("abort", onCallerAbort);
  }
}

/* ── Agentic loop ─────────────────────────────────────────────────────── */

// The agentic tool loop moved to the AgentController (src/lib/ai/agent).
// `runWorkspaceChat` is kept as a backwards-compatible wrapper so the
// Workflow and Agents pages keep working unchanged.

export {
  runWorkspaceChat,
  type WorkspaceChatOptions,
  type WorkspaceChatResult,
} from "./agent/compat";

/* ── Back-compat text-only helper ───────────────────────────────────── */

export interface StreamChatOptions {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  reasoning?: { enabled: boolean; budget?: number };
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream a plain text chat completion (no tools). Calls `onDelta` with each
 * text chunk as it arrives; resolves when the stream ends.
 */
export async function streamChat(opts: StreamChatOptions): Promise<void> {
  await streamTurn({
    provider: opts.provider,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    reasoning: opts.reasoning,
    signal: opts.signal,
    onEvent: (e) => {
      if (e.type === "text") opts.onDelta(e.text);
    },
  });
}
