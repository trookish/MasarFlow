import type { ToolCallRequest, WorkspaceToolDef } from "@/lib/ai/tools";
import type { WireMessage } from "@/lib/ai/chat-client";
import type { ProviderConnection } from "@/lib/ai/catalog";

/**
 * Agent lifecycle protocol — the unified event stream between the
 * AgentController and the UI. Providers (Gemini/Claude/OpenAI/…) emit wildly
 * different wire streams; the LLMProvider layer normalizes them into these
 * events so the frontend never cares which provider is generating.
 */

export type AgentPhase =
  | "idle"
  | "thinking"
  | "calling_tool"
  | "waiting_for_tool"
  | "streaming"
  | "completed"
  | "error"
  | "cancelled";

export type AgentStreamEvent =
  | { type: "agent_started"; requestId: string }
  | { type: "thinking"; text: string }
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
  | { type: "message_started" }
  | { type: "message_delta"; delta: string }
  | { type: "message_complete" }
  | { type: "agent_completed"; iterations: number }
  | { type: "agent_error"; message: string; recoverable?: boolean }
  | { type: "agent_cancelled" }
  | { type: "notice"; message: string }
  | { type: "round"; round: number };

/**
 * Agent safety limits. Everything is configurable (Settings → AI agent) so a
 * runaway loop, a stuck shell command, or a tool-crazy model can never hold
 * the UI or the machine hostage forever.
 */
export interface AgentConfig {
  /** Max model ↔ tool round-trips per user turn. */
  maxIterations: number;
  /** Overall wall-clock budget for the whole agent run. */
  maxRunMs: number;
  /** Per-tool execution budget (longer operations are failed back to the LLM). */
  maxToolMs: number;
  /** Max shell command executions per agent run. */
  maxShellCommands: number;
  /** Max file writes per agent run. */
  maxFileModifications: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxIterations: 30,
  maxRunMs: 600_000,
  maxToolMs: 120_000,
  maxShellCommands: 20,
  maxFileModifications: 15,
};

/** Outcome of one agent run, shaped for persistence. */
export interface AgentResult {
  status: "completed" | "error" | "cancelled";
  /** Concatenated assistant text across every round. */
  text: string;
  /** Concatenated reasoning/thinking across every round (may be empty). */
  reasoning: string;
  /** Every tool call executed, in order. */
  executed: { call: ToolCallRequest; result: string }[];
  /** The full message list after the loop (for persistence/inspection). */
  messages: WireMessage[];
  /** Rounds consumed. */
  iterations: number;
  /** User-facing error when status === "error". */
  error?: string;
}

/** Executes one tool call; resolves with a JSON result string. */
export type AgentExecuteTool = (
  call: ToolCallRequest,
  signal: AbortSignal,
) => Promise<string>;

/** Options for a single agent run. */
export interface AgentRunOptions {
  requestId: string;
  threadId: string;
  /** Provider abstraction — emits normalized lifecycle events. */
  provider: LLMProvider;
  /**
   * The provider connection metadata (id, name, api base URL, …). Forwarded
   * to the provider layer unchanged — the wire client derives the endpoint
   * from `api`, so a full connection object must reach it.
   */
  providerMeta: ProviderConnection;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: WireMessage[];
  /** Tool definitions offered to the model this run. */
  tools: WorkspaceToolDef[];
  /** Executes one tool call and resolves with its JSON result string.
   *  Must never throw for ordinary tool failures — errors go into the result
   *  so the LLM can recover. */
  executeTool: AgentExecuteTool;
  /** Sensitive tools (shell_run) and file-writing tools (fs_write) mapped by
   *  name so the controller can enforce its safety counters. */
  toolKinds?: Partial<Record<string, AgentToolKind>>;
  reasoning?: { enabled: boolean; budget?: number };
  config: AgentConfig;
  /**
   * Model context-window size in tokens (from the catalog). The controller
   * trims the conversation history to fit it, so long threads can't blow
   * past the window and turn every request into a hard 400.
   */
  contextLimit?: number;
  signal: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
}

/** Tool classification for the agent's safety counters. */
export interface AgentToolKind {
  /** True when this tool touches the machine (shell) — counted against the
   *  shell-command limit. */
  shell?: boolean;
  /** True when this tool modifies project files — counted against the
   *  file-modification limit. */
  modifiesFiles?: boolean;
}

/** The LLM provider abstraction — normalized generation, streaming, cancel. */
export interface LLMProvider {
  /**
   * Stream one model turn. Text arrives as message_delta events; tool calls
   * as tool_call events (complete arguments). Resolves with the turn result.
   * Throws on provider/network/abort failures — the controller categorizes.
   */
  generate(
    opts: ProviderTurnOptions,
    onEvent: (event: ProviderStreamEvent) => void,
  ): Promise<ProviderTurnResult>;
}

/** Provider-facing turn options (wire-agnostic). */
export interface ProviderTurnOptions {
  provider: ProviderConnection;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: WireMessage[];
  tools?: WorkspaceToolDef[];
  toolChoice?: "auto" | "required" | "none";
  reasoning?: { enabled: boolean; budget?: number };
  /** Correlates this turn's proxy request with the agent run's logs. */
  requestId?: string;
  signal?: AbortSignal;
}

export interface ProviderTurnResult {
  text: string;
  reasoning: string;
  toolCalls: ToolCallRequest[];
  stopReason: "end" | "tool_calls";
}

/** Raw events emitted by the provider layer while streaming. */
export type ProviderStreamEvent =
  | { type: "message_delta"; delta: string }
  | { type: "thinking"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | { type: "notice"; message: string }
  | { type: "round"; round: number };
