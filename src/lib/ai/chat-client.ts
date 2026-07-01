import {
  providerFormat,
  providerBaseUrl,
  type AiProvider,
} from "./catalog";
import type { WorkspaceToolDef, ToolCallRequest } from "./tools";

/**
 * Client for the /api/chat proxy. The proxy streams NDJSON events; this module
 * parses them and (for tool-enabled sessions) runs the agentic loop: execute
 * the model's tool calls locally, hand the results back, repeat until the
 * model stops calling tools.
 */

export type WireMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string;
      toolCalls?: ToolCallRequest[];
    }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; ok: boolean; content: string }
  | { type: "round"; round: number }
  | { type: "done"; stopReason: "end" | "tool_calls" };

export interface StreamTurnOptions {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: WireMessage[];
  tools?: WorkspaceToolDef[];
  onEvent?: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

export interface TurnResult {
  text: string;
  toolCalls: ToolCallRequest[];
  stopReason: "end" | "tool_calls";
}

/** Stream one model turn through /api/chat, resolving with the full result. */
export async function streamTurn(opts: StreamTurnOptions): Promise<TurnResult> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      format: providerFormat(opts.provider),
      baseUrl: opts.baseUrl?.trim() || providerBaseUrl(opts.provider),
      apiKey: opts.apiKey,
      model: opts.model,
      system: opts.system,
      messages: opts.messages,
      tools: opts.tools,
    }),
    signal: opts.signal,
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
  let buffer = "";
  let text = "";
  const toolCalls: ToolCallRequest[] = [];
  let stopReason: "end" | "tool_calls" = "end";

  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      return;
    }
    if (event.type === "text") text += event.text;
    else if (event.type === "tool_call") {
      toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
    } else if (event.type === "done") stopReason = event.stopReason;
    opts.onEvent?.(event);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handle(line);
  }
  if (buffer) handle(buffer);

  return { text, toolCalls, stopReason };
}

export interface WorkspaceChatOptions extends Omit<StreamTurnOptions, "messages"> {
  messages: WireMessage[];
  /** Executes one tool call and resolves with its JSON result string. */
  executeTool?: (call: ToolCallRequest) => Promise<string>;
  /** Safety cap on model↔tool round-trips per user turn. */
  maxRounds?: number;
}

export interface WorkspaceChatResult {
  /** Concatenated assistant text across every round. */
  text: string;
  /** Every tool call executed, in order. */
  executed: { call: ToolCallRequest; result: string }[];
  /** The full message list after the loop (for persistence/inspection). */
  messages: WireMessage[];
}

/**
 * Run the agentic loop: stream a turn; while the model requests tools,
 * execute them against the workspace, append the results, and continue.
 */
export async function runWorkspaceChat(
  opts: WorkspaceChatOptions,
): Promise<WorkspaceChatResult> {
  const messages: WireMessage[] = [...opts.messages];
  const executed: WorkspaceChatResult["executed"] = [];
  const maxRounds = opts.maxRounds ?? 8;
  let fullText = "";

  for (let round = 0; round < maxRounds; round++) {
    opts.onEvent?.({ type: "round", round });
    const turn = await streamTurn({ ...opts, messages });
    if (turn.text) fullText += (fullText ? "\n\n" : "") + turn.text;

    if (!turn.toolCalls.length || !opts.executeTool) {
      return { text: fullText, executed, messages };
    }

    messages.push({
      role: "assistant",
      content: turn.text,
      toolCalls: turn.toolCalls,
    });

    for (const call of turn.toolCalls) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const result = await opts.executeTool(call);
      executed.push({ call, result });
      let ok = true;
      try {
        ok = (JSON.parse(result) as { ok?: boolean }).ok !== false;
      } catch {
        /* non-JSON results count as ok */
      }
      opts.onEvent?.({
        type: "tool_result",
        id: call.id,
        name: call.name,
        ok,
        content: result,
      });
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: result,
      });
    }
  }

  return { text: fullText, executed, messages };
}

/* ── Back-compat text-only helper ───────────────────────────────────── */

export interface StreamChatOptions {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
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
    signal: opts.signal,
    onEvent: (e) => {
      if (e.type === "text") opts.onDelta(e.text);
    },
  });
}
