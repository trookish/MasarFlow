/**
 * Browser bridge for opencode-executed workspace tools.
 *
 * The generated opencode custom tools (toolgen.ts) POST to
 * `/api/opencode/ws-call`; that route registers a pending call here and waits
 * for the answer. The browser holds an SSE subscription
 * (`GET /api/opencode/bridge`); pending calls matching its session are
 * delivered as `ws_tool` events. The browser then:
 *
 *   1. claims the call (`POST /api/opencode/ws-call/claim` — the first tab
 *      to claim wins, so duplicate tabs can never double-mutate),
 *   2. executes the workspace function against IndexedDB
 *      (`executeWorkspaceToolWithUndo` — undo, dev logs, wikilinks included),
 *   3. posts the result back (`POST /api/opencode/ws-call/result`), which
 *      resolves the pending call and unblocks the opencode tool.
 *
 * The correlationId is an unguessable UUID — it acts as the capability token
 * for claim/result, so a caller can only ever answer a call it was actually
 * handed. Server-side only; never imported into browser bundles.
 */

export interface PendingWorkspaceCall {
  correlationId: string;
  /** The opencode session whose turn requested this tool. */
  sessionId: string;
  /** Workspace function name (e.g. create_note). */
  name: string;
  args: Record<string, unknown>;
  createdAt: number;
  /** Set by the first browser tab to claim the call (dedupe). */
  claimed: boolean;
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}

type Subscriber = (call: PendingWorkspaceCall) => void;

const pendingCalls = new Map<string, PendingWorkspaceCall>();
const subscribers = new Set<Subscriber>();

/** Default answer window before the opencode tool gives up. */
export const DEFAULT_TOOL_TIMEOUT_MS = 120_000;

/**
 * Register a pending workspace-tool call and return a promise that resolves
 * with the tool's JSON result string when the browser answers (or rejects on
 * timeout / browser-reported failure).
 */
export function requestWorkspaceTool(opts: {
  sessionId: string;
  name: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const correlationId = crypto.randomUUID();
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCalls.delete(correlationId);
      reject(
        new Error(
          "The MasarFlow chat didn't answer this workspace tool call in time — make sure the chat tab is open, then retry.",
        ),
      );
    }, timeoutMs);
    const settle = (fn: () => void) => {
      clearTimeout(timer);
      pendingCalls.delete(correlationId);
      fn();
    };
    const call: PendingWorkspaceCall = {
      correlationId,
      sessionId: opts.sessionId,
      name: opts.name,
      args: opts.args,
      createdAt: Date.now(),
      claimed: false,
      resolve: (result) => settle(() => resolve(result)),
      reject: (error) => settle(() => reject(error)),
    };
    pendingCalls.set(correlationId, call);
    for (const subscriber of subscribers) subscriber(call);
  });
}

export function getPendingCall(
  correlationId: string,
): PendingWorkspaceCall | undefined {
  return pendingCalls.get(correlationId);
}

export function hasPendingCall(correlationId: string): boolean {
  return pendingCalls.has(correlationId);
}

/** Number of unanswered tool calls (diagnostics/logging). */
export function pendingCallCount(): number {
  return pendingCalls.size;
}

/**
 * Atomically claim a pending call for execution. Exactly one browser tab
 * receives true; the others must skip execution (prevents double-mutations
 * when several tabs hold an SSE subscription).
 */
export function claimWorkspaceTool(correlationId: string): boolean {
  const call = pendingCalls.get(correlationId);
  if (!call || call.claimed) return false;
  call.claimed = true;
  return true;
}

/** Deliver a tool result from the browser. Returns false when unknown. */
export function resolveWorkspaceTool(
  correlationId: string,
  result: string,
): boolean {
  const call = pendingCalls.get(correlationId);
  if (!call) return false;
  call.resolve(result);
  return true;
}

/** Report a browser-side execution failure. Returns false when unknown. */
export function rejectWorkspaceTool(
  correlationId: string,
  error: string,
): boolean {
  const call = pendingCalls.get(correlationId);
  if (!call) return false;
  call.reject(new Error(error));
  return true;
}

/** Subscribe to pending calls (used by the SSE bridge route). */
export function subscribeWorkspaceTools(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
