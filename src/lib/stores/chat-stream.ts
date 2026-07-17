import { create } from "zustand";
import type { ToolActivity } from "@/lib/db/schema";
import type { AiProvider } from "@/lib/ai/catalog";
import type { WireMessage } from "@/lib/ai/chat-client";
import { runWorkspaceChat } from "@/lib/ai/chat-client";
import { WORKSPACE_TOOLS, executeWorkspaceTool } from "@/lib/ai/tools";
import {
  assembleWorkspaceContext,
  buildAssistantSystemPrompt,
} from "@/lib/ai/context";
import { chatMessagesRepo, chatThreadsRepo } from "@/lib/db/repos";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface ActiveStream {
  /** The assistant message id being streamed into. */
  messageId: string;
  threadId: string;
  /** Accumulated assistant text so far. */
  text: string;
  /** Accumulated reasoning/thinking so far. */
  reasoning: string;
  /** Tool calls executed during this turn. */
  tools: ToolActivity[];
  /** Epoch ms when the stream started. */
  startedAt: number;
  /** Epoch ms when the stream finished (null while still running). */
  endedAt: number | null;
  /** Non-null if the stream errored. */
  error: string | null;
}

interface ChatStreamState {
  /** Active streams keyed by threadId — at most one per thread. */
  streams: Record<string, ActiveStream>;
  /** Get the active stream for a thread (or undefined). */
  getStream: (threadId: string) => ActiveStream | undefined;
  /** Launch a new stream. No-op if one is already running for the thread. */
  startStream: (opts: StartStreamOpts) => void;
  /** Abort a running stream. */
  stopStream: (threadId: string) => void;
}

export interface StartStreamOpts {
  threadId: string;
  messageId: string;
  projectId: string;
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  modelDef?: { reasoning?: boolean };
  history: WireMessage[];
  userText: string;
}

/* ── Abort controllers (kept outside Zustand – not serialisable) ──── */

const abortControllers = new Map<string, AbortController>();

/* ── Helper ─────────────────────────────────────────────────────────── */

function summarizeArgs(args: Record<string, unknown>): string {
  for (const k of ["title", "name", "number", "query", "content", "id"]) {
    const v = args[k];
    if (typeof v === "string" && v.trim()) return v.slice(0, 80);
  }
  return "";
}

/* ── Store ──────────────────────────────────────────────────────────── */

export const useChatStreamStore = create<ChatStreamState>()((set, get) => ({
  streams: {},

  getStream: (threadId) => get().streams[threadId],

  startStream: (opts) => {
    const { threadId } = opts;
    // Don't start if already running for this thread.
    if (get().streams[threadId]?.endedAt === null) return;

    const controller = new AbortController();
    abortControllers.set(threadId, controller);

    const initial: ActiveStream = {
      messageId: opts.messageId,
      threadId,
      text: "",
      reasoning: "",
      tools: [],
      startedAt: Date.now(),
      endedAt: null,
      error: null,
    };

    set((s) => ({
      streams: { ...s.streams, [threadId]: initial },
    }));

    // Fire-and-forget — the stream runs in the background.
    void runStream(opts, controller, set);
  },

  stopStream: (threadId) => {
    const ctrl = abortControllers.get(threadId);
    if (ctrl) ctrl.abort();
  },
}));

/* ── Background streaming logic ─────────────────────────────────────── */

async function runStream(
  opts: StartStreamOpts,
  controller: AbortController,
  set: (
    partial:
      | Partial<ChatStreamState>
      | ((s: ChatStreamState) => Partial<ChatStreamState>),
  ) => void,
) {
  const { threadId, messageId } = opts;

  const reasoning =
    opts.modelDef?.reasoning ? { enabled: true, budget: 4096 } : undefined;

  let acc = "";
  let reasoningAcc = "";
  const tools: ToolActivity[] = [];
  const toolIndexById = new Map<string, number>();

  const updateStore = () => {
    set((s) => {
      const prev = s.streams[threadId];
      if (!prev || prev.messageId !== messageId) return s;
      return {
        streams: {
          ...s.streams,
          [threadId]: {
            ...prev,
            text: acc,
            reasoning: reasoningAcc,
            tools: [...tools],
          },
        },
      };
    });
  };

  try {
    const contextText = await assembleWorkspaceContext(opts.projectId, {
      query: opts.userText,
    });
    const system = buildAssistantSystemPrompt(contextText, { withTools: true });

    const result = await runWorkspaceChat({
      provider: opts.provider,
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      model: opts.model,
      system,
      messages: opts.history,
      tools: WORKSPACE_TOOLS,
      reasoning,
      executeTool: (call) => executeWorkspaceTool(opts.projectId, call),
      signal: controller.signal,
      onEvent: (e) => {
        if (e.type === "text") {
          acc += e.text;
        } else if (e.type === "reasoning") {
          reasoningAcc += e.text;
        } else if (e.type === "round" && e.round > 0 && acc) {
          acc += "\n\n";
        } else if (e.type === "tool_call") {
          toolIndexById.set(e.id, tools.length);
          tools.push({
            name: e.name,
            summary: summarizeArgs(e.arguments),
            ok: true,
          });
        } else if (e.type === "tool_result") {
          const i = toolIndexById.get(e.id);
          if (i !== undefined) tools[i] = { ...tools[i], ok: e.ok };
        }
        updateStore();
      },
    });

    // Persist the completed message to Dexie.
    await chatMessagesRepo.update(messageId, {
      content: result.text || acc,
      reasoning: result.reasoning || reasoningAcc,
      toolActivity: tools,
    });
    // Bump thread updatedAt so the sidebar re-sorts.
    await chatThreadsRepo.update(threadId, {});

    // Mark stream as finished (keep data so UI can render until Dexie catches up).
    set((s) => {
      const prev = s.streams[threadId];
      if (!prev || prev.messageId !== messageId) return s;
      return {
        streams: {
          ...s.streams,
          [threadId]: {
            ...prev,
            text: result.text || acc,
            reasoning: result.reasoning || reasoningAcc,
            endedAt: Date.now(),
          },
        },
      };
    });
  } catch (e) {
    const message = controller.signal.aborted
      ? "Stopped."
      : (e as Error).message;
    await chatMessagesRepo.update(messageId, { error: message });

    set((s) => {
      const prev = s.streams[threadId];
      if (!prev || prev.messageId !== messageId) return s;
      return {
        streams: {
          ...s.streams,
          [threadId]: { ...prev, endedAt: Date.now(), error: message },
        },
      };
    });
  } finally {
    abortControllers.delete(threadId);

    // Clear the finished stream from store after a short delay so the UI has
    // time to transition to the persisted Dexie data.
    setTimeout(() => {
      set((s) => {
        const cur = s.streams[threadId];
        // Only clear if it's the same stream (not a new one that started).
        if (cur && cur.messageId === messageId && cur.endedAt !== null) {
          const next = { ...s.streams };
          delete next[threadId];
          return { streams: next };
        }
        return s;
      });
    }, 500);
  }
}
