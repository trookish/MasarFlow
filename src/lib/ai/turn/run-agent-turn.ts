import {
  ChatAbortError,
  type StreamEvent,
  type WireMessage,
} from "@/lib/ai/chat-client";
import { AgentController } from "@/lib/ai/agent/controller";
import { ProxyProvider } from "@/lib/ai/agent/provider";
import { toLegacyEvent } from "@/lib/ai/agent/compat";
import { createAgentLogger, newRequestId } from "@/lib/ai/agent/logger";
import type { AgentConfig, LLMProvider } from "@/lib/ai/agent/types";
import type { AiProvider, ProviderConnection } from "@/lib/ai/catalog";
import { executeFsTool, type ApprovalRequest } from "@/lib/ai/fs-tools";
import { executeWorkspaceToolWithUndo, isMutatingTool } from "@/lib/ai/undo";
import type { ToolCallRequest } from "@/lib/ai/tools";
import type { LinkedProject } from "@/lib/db/schema";
import {
  agentConfigFromSettings,
  useAgentSettings,
  type AgentSettingsState,
} from "@/lib/stores/agent-settings";
import { expandToolCall, isFsCall, toolsFor, type ToolsetId } from "./toolsets";

/**
 * The one turn service (v0.3 P4 T1). Chat, Agents and Workflow run a model turn through here, so
 * they share the limits from settings, the model's context window, the tool set, the approval
 * policy and the undo ledger. Errors keep the historical contract: cancellation throws
 * ChatAbortError and provider failures throw Error.
 */

export type TurnSurface = "chat" | "agent" | "workflow";

/** Context window used when the catalog does not know the model. */
export const FALLBACK_CONTEXT_LIMIT = 32_000;

/**
 * Which tool calls pause for the user, per surface. File writes and shell commands always ask.
 * Agents run without the user watching each step, so they also ask before changing workspace
 * records; chat and workflow changes are recorded for undo instead.
 */
export const APPROVAL_POLICY: Record<
  TurnSurface,
  "files" | "files-and-records"
> = {
  chat: "files",
  agent: "files-and-records",
  workflow: "files",
};

/** A request for the user's decision before a tool runs. */
export interface TurnApproval extends ApprovalRequest {
  surface: TurnSurface;
  /** "files" for file and shell tools, "workspace" for changes to workspace records */
  scope: "files" | "workspace";
}

export type TurnEvent =
  | StreamEvent
  | {
      type: "approval";
      id: string;
      name: string;
      scope: TurnApproval["scope"];
      approved: boolean;
    }
  | { type: "undo_recorded"; id: string; name: string };

type LimitSettings = Pick<
  AgentSettingsState,
  | "maxIterations"
  | "maxRunMs"
  | "maxToolMs"
  | "maxShellCommands"
  | "maxFileModifications"
>;

export interface AgentTurnOptions {
  surface: TurnSurface;
  projectId: string;
  threadId: string;
  /** what undo records point to (the assistant message, or the run step) */
  undoOwnerId: string;
  provider: ProviderConnection | AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  system?: string;
  messages: WireMessage[];
  toolset: ToolsetId;
  linkedRoots?: LinkedProject[];
  reasoning?: { enabled: boolean; budget?: number };
  signal?: AbortSignal;
  onEvent?: (event: TurnEvent) => void;
  /** Ask the user. Without it, a call that needs approval is refused. */
  requestApproval?: (request: TurnApproval) => Promise<boolean>;
  /** cap on model/tool rounds for this turn (never above the settings value) */
  maxRounds?: number;
  /** correlates log lines with the caller's own request id */
  requestId?: string;
  /** test seams */
  settings?: LimitSettings;
  llm?: LLMProvider;
  contextLimit?: number;
}

export interface AgentTurnResult {
  text: string;
  reasoning: string;
  executed: { call: ToolCallRequest; result: string }[];
  messages: WireMessage[];
  contextLimit: number;
}

/** The model's context window from the catalog entry, or the fallback. */
export function resolveContextLimit(
  provider: ProviderConnection | AiProvider,
  model: string,
): number {
  const models = (provider as Partial<AiProvider>).models as
    Record<string, { limit?: { context?: number } }> | undefined;
  const limit = models?.[model]?.limit?.context;
  return typeof limit === "number" && limit > 0
    ? limit
    : FALLBACK_CONTEXT_LIMIT;
}

const refused = (error: string) => JSON.stringify({ ok: false, error });

export async function runAgentTurn(
  opts: AgentTurnOptions,
): Promise<AgentTurnResult> {
  const settings = opts.settings ?? useAgentSettings.getState();
  const base: AgentConfig = agentConfigFromSettings(
    settings as AgentSettingsState,
  );
  const config: AgentConfig = opts.maxRounds
    ? { ...base, maxIterations: Math.min(base.maxIterations, opts.maxRounds) }
    : base;
  const contextLimit =
    opts.contextLimit ?? resolveContextLimit(opts.provider, opts.model);
  const roots = opts.linkedRoots ?? [];
  const tools = toolsFor(opts.toolset, { hasLinkedRoot: roots.length > 0 });
  const signal = opts.signal ?? new AbortController().signal;
  const emit = (e: TurnEvent) => opts.onEvent?.(e);
  const requestId = opts.requestId ?? newRequestId();
  const policy = APPROVAL_POLICY[opts.surface];

  const ask = async (
    request: ApprovalRequest,
    scope: TurnApproval["scope"],
    id: string,
  ): Promise<boolean> => {
    const approved =
      signal.aborted || !opts.requestApproval
        ? false
        : await opts.requestApproval({
            ...request,
            surface: opts.surface,
            scope,
          });
    emit({ type: "approval", id, name: request.name, scope, approved });
    return approved;
  };

  const executeTool = async (raw: ToolCallRequest): Promise<string> => {
    const expanded = expandToolCall(raw);
    if (!expanded.ok) return refused(expanded.error);
    const call = expanded.call;
    if (isFsCall(call)) {
      if (roots.length === 0)
        return refused("This project has no linked folder.");
      return executeFsTool(
        { roots, requestApproval: (req) => ask(req, "files", raw.id), signal },
        call,
      );
    }
    const mutating = isMutatingTool(call.name);
    if (mutating && policy === "files-and-records") {
      const ok = await ask(
        { name: call.name, arguments: call.arguments, rootLabel: "Workspace" },
        "workspace",
        raw.id,
      );
      if (!ok) return refused("The user declined this change.");
    }
    const result = await executeWorkspaceToolWithUndo(
      opts.projectId,
      call,
      opts.undoOwnerId,
    );
    if (mutating && /"ok"\s*:\s*true/.test(result))
      emit({ type: "undo_recorded", id: raw.id, name: call.name });
    return result;
  };

  const result = await new AgentController().run({
    requestId,
    threadId: opts.threadId,
    provider:
      opts.llm ??
      new ProxyProvider(
        createAgentLogger(requestId, { threadId: opts.threadId }),
      ),
    providerMeta: opts.provider as ProviderConnection,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    model: opts.model,
    system: opts.system,
    messages: opts.messages,
    tools,
    // The coarse names map to the same safety counters as the legacy ones.
    toolKinds: {
      write_file: { modifiesFiles: true },
      run_command: { shell: true },
    },
    executeTool,
    reasoning: opts.reasoning,
    config,
    contextLimit,
    signal,
    onEvent: (e) => {
      const legacy = toLegacyEvent(e);
      if (legacy) emit(legacy);
    },
  });

  if (result.status === "cancelled") throw new ChatAbortError("Aborted");
  if (result.status === "error")
    throw new Error(result.error ?? "The agent failed.");
  return {
    text: result.text,
    reasoning: result.reasoning,
    executed: result.executed,
    messages: result.messages,
    contextLimit,
  };
}
