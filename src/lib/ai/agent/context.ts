import {
  assembleWorkspaceContext,
  buildAssistantSystemPrompt,
} from "@/lib/ai/context";

/**
 * The ContextManager: assembles the system briefing for an agent run —
 * project snapshot, RAG-relevant passages, linked-project orientation, and
 * the assistant role — bounded by the model's context window.
 *
 * Only relevant information is included: never the whole project. The
 * briefing budget shrinks for small-context models, and the manager reports
 * when it had to trim so the UI can tell the user.
 */

export interface AgentContextOptions {
  projectId: string;
  /** The user's request — drives which note/doc bodies get inlined. */
  query: string;
  /** The model's context-window size, when the catalog knows it. */
  contextLimit?: number;
  withTools: boolean;
  /**
   * Which tools the prompt should describe as actually available:
   * "workspace" (in-browser Agent Loop) or "filesystem" (OpenCode-backed
   * chat). Only meaningful when withTools is true.
   */
  toolbelt?: "workspace" | "filesystem";
  linkedRoots?: { name: string; rootPath: string }[];
  role?: string;
  /** Extra note about where the filesystem tools are rooted. */
  filesystemNote?: string;
  /** Real tools registered on the OpenCode server (filesystem toolbelt). */
  filesystemTools?: { id: string; description: string }[];
  /** Caller's cancellation signal (honored during RAG retrieval). */
  signal?: AbortSignal;
}

export interface AgentContextResult {
  system: string;
  /** True when the briefing budget was trimmed to fit a small context. */
  trimmed: boolean;
}

const MAX_BRIEFING = 28_000;

export async function buildAgentSystemPrompt(
  opts: AgentContextOptions,
): Promise<AgentContextResult> {
  // Cap the briefing at ~half the model's context so history + answer always
  // fit; small-context models get a tighter briefing.
  const briefingBudget = opts.contextLimit
    ? Math.min(MAX_BRIEFING, Math.floor((opts.contextLimit * 4) / 2))
    : MAX_BRIEFING;
  const trimmed = briefingBudget < MAX_BRIEFING;

  const contextText = await assembleWorkspaceContext(opts.projectId, {
    query: opts.query,
    budget: briefingBudget,
    signal: opts.signal,
  });
  const system = buildAssistantSystemPrompt(contextText, {
    withTools: opts.withTools,
    toolbelt: opts.toolbelt,
    role: opts.role,
    linkedRoots: opts.linkedRoots,
    filesystemNote: opts.filesystemNote,
    filesystemTools: opts.filesystemTools,
  });
  return { system, trimmed };
}
