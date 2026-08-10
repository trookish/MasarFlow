import {
  ChatAbortError,
  type StreamEvent,
  type StreamTurnOptions,
  type WireMessage,
} from "@/lib/ai/chat-client";
import type { ToolCallRequest } from "@/lib/ai/tools";
import { AgentController } from "./controller";
import { ProxyProvider } from "./provider";
import { createAgentLogger, newRequestId } from "./logger";
import { DEFAULT_AGENT_CONFIG } from "./types";
import type { AgentStreamEvent, AgentConfig } from "./types";

/**
 * Compatibility wrapper preserving the historical `runWorkspaceChat` API for
 * the Workflow pipeline and Agents pages. It runs the real AgentController
 * (limits, cancellation, lifecycle logging) underneath and translates its
 * lifecycle events back into the legacy event shapes those pages consume.
 *
 * Errors keep their legacy throwing contract: cancellation throws
 * ChatAbortError, provider failures throw Error — so existing catch blocks
 * behave exactly as before.
 */

export interface WorkspaceChatOptions extends Omit<
  StreamTurnOptions,
  "messages"
> {
  messages: WireMessage[];
  /** Executes one tool call and resolves with its JSON result string. */
  executeTool?: (call: ToolCallRequest) => Promise<string>;
  /** Safety cap on model↔tool round-trips per user turn. */
  maxRounds?: number;
}

export interface WorkspaceChatResult {
  /** Concatenated assistant text across every round. */
  text: string;
  /** Concatenated reasoning/thinking across every round (may be empty). */
  reasoning: string;
  /** Every tool call executed, in order. */
  executed: { call: ToolCallRequest; result: string }[];
  /** The full message list after the loop (for persistence/inspection). */
  messages: WireMessage[];
}

/** Map lifecycle events to the legacy flat event shapes. */
function toLegacyEvent(e: AgentStreamEvent): StreamEvent | null {
  switch (e.type) {
    case "message_delta":
      return { type: "text", text: e.delta };
    case "thinking":
      return { type: "reasoning", text: e.text };
    case "tool_call":
      return {
        type: "tool_call",
        id: e.id,
        name: e.name,
        arguments: e.arguments,
      };
    case "tool_result":
      return {
        type: "tool_result",
        id: e.id,
        name: e.name,
        ok: e.ok,
        content: e.content,
      };
    case "notice":
      return { type: "notice", message: e.message };
    case "round":
      return { type: "round", round: e.round };
    default:
      // agent_started / message_* / agent_completed / agent_error /
      // agent_cancelled are lifecycle events — legacy consumers don't use them.
      return null;
  }
}

/**
 * Run the agentic loop: stream a turn; while the model requests tools,
 * execute them, append the results, and continue. Same contract as the
 * original client-side loop, now backed by the AgentController.
 */
export async function runWorkspaceChat(
  opts: WorkspaceChatOptions,
): Promise<WorkspaceChatResult> {
  const requestId = newRequestId();
  const log = createAgentLogger(requestId);
  const config: AgentConfig = {
    ...DEFAULT_AGENT_CONFIG,
    maxIterations: opts.maxRounds ?? DEFAULT_AGENT_CONFIG.maxIterations,
  };
  const controller = new AgentController();
  const provider = new ProxyProvider(log);
  const signal = opts.signal ?? new AbortController().signal;

  const result = await controller.run({
    requestId,
    threadId: "pipeline",
    provider,
    providerMeta: opts.provider,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools ?? [],
    executeTool: opts.executeTool
      ? async (call) => opts.executeTool!(call)
      : () => Promise.resolve(""),
    reasoning: opts.reasoning,
    config,
    signal,
    onEvent: (e) => {
      const legacy = toLegacyEvent(e);
      if (legacy) opts.onEvent?.(legacy);
    },
  });

  // Preserve the legacy throwing contract: consumers catch ChatAbortError for
  // cancellations and Error for failures.
  if (result.status === "cancelled") throw new ChatAbortError("Aborted");
  if (result.status === "error")
    throw new Error(result.error ?? "The agent failed.");

  return {
    text: result.text,
    reasoning: result.reasoning,
    executed: result.executed,
    messages: result.messages,
  };
}
