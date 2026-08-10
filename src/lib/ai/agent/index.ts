/**
 * Agent facade — the public surface of MasarFlow's agentic layer.
 *
 *   User → AgentController → ContextManager → LLMProvider → ToolRegistry →
 *         → tools → results → loop → final response → streamed to the UI
 *
 * Consumers that need the old `runWorkspaceChat` API get a compatibility
 * wrapper (see `compat.ts`) that runs the real AgentController underneath.
 */

export { AgentController, runAgent } from "./controller";
export { ToolRegistry } from "./registry";
export { ProxyProvider } from "./provider";
export { buildAgentSystemPrompt } from "./context";
export { createAgentLogger, newRequestId } from "./logger";
export {
  DEFAULT_AGENT_CONFIG,
  type AgentConfig,
  type AgentExecuteTool,
  type AgentPhase,
  type AgentResult,
  type AgentRunOptions,
  type AgentStreamEvent,
  type AgentToolKind,
  type LLMProvider,
  type ProviderStreamEvent,
  type ProviderTurnOptions,
  type ProviderTurnResult,
} from "./types";
