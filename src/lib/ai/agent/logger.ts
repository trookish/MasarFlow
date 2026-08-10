/**
 * Structured agent-lifecycle logging. Every agent run gets a request ID that
 * correlates all its lines across the client and the server proxies:
 *
 *   [AGENT:req_abc] Started (thread: t1)
 *   [AGENT:req_abc] Iteration 1 (provider: anthropic, model: claude-…)
 *   [LLM:req_abc] Request started
 *   [LLM:req_abc] Streaming started
 *   [TOOL:req_abc] Execution started (tool: fs_search)
 *   [TOOL:req_abc] Execution completed (tool: fs_search, 412ms, ok)
 *   [AGENT:req_abc] Completed (iterations: 3)
 *
 * Never logs API keys, tokens, or message bodies.
 */

export interface AgentLogger {
  /** [AGENT] lifecycle line (request id + thread id attached). */
  agent: (message: string, extra?: Record<string, unknown>) => void;
  /** [LLM] provider line. */
  llm: (message: string, extra?: Record<string, unknown>) => void;
  /** [TOOL] execution line. */
  tool: (message: string, extra?: Record<string, unknown>) => void;
}

export function createAgentLogger(
  requestId: string,
  extra: { threadId?: string } = {},
): AgentLogger {
  const scope = { requestId, threadId: extra.threadId };
  const make =
    (tag: string) =>
    (message: string, extra2: Record<string, unknown> = {}) =>
      console.info(
        `[${tag}:${requestId}] ${message}`,
        JSON.stringify({ ...scope, ...extra2 }),
      );
  return {
    agent: make("AGENT"),
    llm: make("LLM"),
    tool: make("TOOL"),
  };
}

/** A fresh monotonic request id for one user turn (client-side). */
export function newRequestId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `req_${rand}`;
}
