"use client";

import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plug,
  Plus,
  Trash2,
  Send,
  Square,
  ChevronDown,
  ChevronRight,
  Search,
  MessageSquare,
  Bot,
  AlertCircle,
  Wrench,
  Check,
  X,
  Loader2,
  Sparkles,
  Paperclip,
  Mic,
  MicOff,
  Copy,
  RotateCw,
  Pencil,
  Undo2,
  BrainCircuit,
  GitCompareArrows,
  FileText,
  Info,
  ImageIcon,
  AtSign,
  Hash,
  FolderGit2,
  ShieldAlert,
  Terminal,
  MessageCircleQuestion,
} from "lucide-react";
import {
  chatThreadsRepo,
  chatMessagesRepo,
  notesRepo,
  linkedProjectsRepo,
  aiUndoRepo,
  aiConnectionsRepo,
} from "@/lib/db/repos";
import type {
  ChatMessage,
  ChatThread,
  ChatAttachment,
  ChatBackend,
  ToolActivity,
  AiUndo,
  AiConnection,
} from "@/lib/db/schema";
import { buildAgentSystemPrompt } from "@/lib/ai/agent";
import { newRequestId } from "@/lib/ai/agent/logger";
import {
  sendTurn,
  ensureChatSession,
  getChatState,
  abortChatTurn,
  approvePermission,
  answerQuestion,
  rejectQuestion,
  undoChatMessage,
  fetchOpenCodeModels,
  fetchOpenCodeTools,
  checkOpenCodeHealth,
  subscribeBridge,
  claimBridgeCall,
  postBridgeResult,
  postBridgeError,
  type BridgeWsToolCall,
  type OpenCodeModelsPayload,
  type OpenCodeToolInfo,
} from "@/lib/ai/opencode-client";
import type { OpenCodeFrontendEvent } from "@/lib/opencode/types";
import type {
  OpenCodePart,
  OpenCodePatchPart,
  OpenCodeQuestionInfo,
  OpenCodeReasoningPart,
  OpenCodeTextPart,
  OpenCodeToolPart,
} from "@/lib/opencode/types";
import {
  prepareAttachment,
  type PreparedAttachment,
} from "@/lib/ai/attachments";
import {
  fetchCatalog,
  defaultModelId,
  modelsForProvider,
  modelSupportsImages,
  modelSupportsReasoning,
  modelSupportsTools,
  type Catalog,
  type AiModel,
  type AiProvider,
} from "@/lib/ai/catalog";
import { WORKSPACE_TOOLS, WORKSPACE_TOOL_NAMES } from "@/lib/ai/tools";
import {
  FS_TOOLS,
  FS_TOOL_NAMES,
  executeFsTool,
  type ApprovalRequest,
} from "@/lib/ai/fs-tools";
import { executeWorkspaceToolWithUndo } from "@/lib/ai/undo";
import {
  runWorkspaceChat,
  ChatAbortError,
  type StreamEvent,
  type WireMessage,
} from "@/lib/ai/chat-client";
import {
  attachmentsToWire,
  buildLegacyMessages,
  providerForConnection,
} from "@/lib/ai/chat-backends";
import { useSpeechInput } from "@/lib/hooks/use-speech";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { MarkdownPreview } from "@/components/brain/markdown-preview";
import { LinkedProjectsDialog } from "./linked-projects-dialog";
import { ConnectionsDialog } from "./connections-dialog";
import {
  MentionMenu,
  getCaretCoordinates,
  type MentionMenuHandle,
} from "./mention-menu";
import {
  detectTrigger,
  pageToken,
  recordToken,
  stripMentionToken,
  firstPlaceholderRange,
  newMentionUid,
  type Mention,
  type TriggerState,
  type MenuResult,
} from "@/lib/chat/mentions";
import { resolveRecordMention } from "@/lib/chat/mention-resolve";

/* ── Suggestions shown on an empty thread ─────────────────────────────── */

const AGENTIC_SUGGESTIONS = [
  "Summarize the current state of my workspace",
  "What should I work on next? Check my open tasks and specs",
  "Create a task for everything unresolved in my latest notes",
  "Review my specs and flag anything without acceptance criteria",
];
const CHAT_SUGGESTIONS = [
  "Explain the trade-offs between REST and GraphQL",
  "Help me name this feature — I'll describe it",
  "Write a concise standup update from bullet points",
  "Brainstorm 10 ideas for improving developer onboarding",
];

interface LiveStream {
  id: string;
  text: string;
  reasoning: string;
  tools: ToolActivity[];
  notices: string[];
  files: string[];
}

/** Convert a snake_case tool name (`read_note`) to camelCase (`readNote`). */
function prettyToolName(name: string): string {
  return name
    .split("_")
    .map((p, i) => (i === 0 ? p : p[0]?.toUpperCase() + p.slice(1)))
    .join("");
}

/**
 * A user message identical to the thread's last user message, created less
 * than 2s ago, is a double-fire (e.g. a key-repeat Enter) — dedupe it.
 */
function isDuplicateUserMessage(m: ChatMessage, text: string): boolean {
  return (
    m.role === "user" && m.content === text && Date.now() - m.createdAt < 2000
  );
}

export function ChatView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("thread");
  const { density, showTimestamps, defaultBackend } = usePageSettings(
    (s) => s.chat,
  );

  const [models, setModels] = useState<OpenCodeModelsPayload | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [ocTools, setOcTools] = useState<OpenCodeToolInfo[]>([]);
  const [opencodeHealthy, setOpencodeHealthy] = useState(true);
  /**
   * The opencode session this browser answers workspace-tool calls for. Kept
   * in sync with the active thread's session (created/ensured per turn), so
   * the SSE bridge only delivers calls that belong to this chat.
   */
  const [bridgeSession, setBridgeSession] = useState<string | null>(null);
  const bridgeSessionRef = useRef<string | null>(null);
  /** Latest handler for bridge tool calls (stable across reconnects). */
  const bridgeHandlerRef = useRef<(call: BridgeWsToolCall) => void>(() => {});
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [threadQuery, setThreadQuery] = useState("");
  const [pending, setPending] = useState<PreparedAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [linkDialog, setLinkDialog] = useState(false);
  const [connDialog, setConnDialog] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    permissionId: string;
    sessionId: string;
    type: string;
    title: string;
    pattern?: string;
  } | null>(null);
  /** In-browser fs/shell approval (API/Ollama backends): resolve the promise. */
  const [legacyApproval, setLegacyApproval] = useState<{
    request: ApprovalRequest;
    resolve: (allowed: boolean) => void;
  } | null>(null);
  /** OpenCode `question` tool request — the dialog the AI waits on. */
  const [pendingQuestion, setPendingQuestion] = useState<{
    questionId: string;
    sessionId: string;
    questions: OpenCodeQuestionInfo[];
  } | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Synchronous busy flag — unlike `stream` state it flips before the first
   * await, so rapid double-Enter can never start a second turn.
   */
  const busyRef = useRef(false);
  /** Monotonic turn generation; stale turns can't touch state or the DB. */
  const turnGenRef = useRef(0);
  /** True only when the user pressed Stop — the sole source of "Stopped.". */
  const userCancelledRef = useRef(false);
  /** The assistant message of the in-flight turn (for interrupted marks). */
  const activeAssistantRef = useRef<string | null>(null);
  /** Streaming messages already handed to the resume/reconcile path. */
  const recoveryHandledRef = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<MentionMenuHandle>(null);

  // Composer mention state: `/ @ #` trigger menu + selected mention chips.
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      try {
        const c = await fetchCatalog();
        setCatalog(c);
      } catch {
        // The fallback catalog never throws; this keeps TS honest.
      }
      try {
        const [catalogData, health] = await Promise.all([
          fetchOpenCodeModels(),
          checkOpenCodeHealth(),
        ]);
        setModels(catalogData);
        setOpencodeHealthy(health.ok);
        if (health.ok) {
          // The real registered tool set — the agentic prompt lists these so
          // the model never tries tools that don't exist on the server.
          fetchOpenCodeTools()
            .then(setOcTools)
            .catch(() => {});
        }
      } catch {
        setOpencodeHealthy(false);
      }
    })();
  }, []);

  // The registered workspace functions + the server's native fs tools, split
  // for the prompt: workspace functions mutate the project DB, fs tools hit
  // the real files on disk. Only tools the server actually exposes are listed.
  const ocToolIds = useMemo(() => new Set(ocTools.map((t) => t.id)), [ocTools]);
  const registeredWorkspaceTools = useMemo(
    () =>
      WORKSPACE_TOOLS.filter((def) => ocToolIds.has(def.name)).map((def) => ({
        name: def.name,
        description: def.description,
      })),
    [ocToolIds],
  );
  const nativeFsTools = useMemo(
    () => ocTools.filter((t) => !WORKSPACE_TOOL_NAMES.includes(t.id)),
    [ocTools],
  );

  useEffect(() => {
    bridgeSessionRef.current = bridgeSession;
  }, [bridgeSession]);

  const threadsRaw = useLiveQuery(
    () => chatThreadsRepo.listByProject(projectId),
    [projectId],
  );
  const threads = useMemo(() => threadsRaw ?? [], [threadsRaw]);
  const messages =
    useLiveQuery(() => chatMessagesRepo.listByThread(threadId), [threadId]) ??
    [];
  const linkedRoots = useLiveQuery(
    () =>
      projectId
        ? linkedProjectsRepo.listByProject(projectId)
        : Promise.resolve([]),
    [projectId],
  );
  const connections = useLiveQuery(() => aiConnectionsRepo.list(), []) ?? [];

  const thread = threads.find((t) => t.id === threadId) ?? null;

  // The session this browser answers workspace-tool calls for: the explicit
  // one created/ensured this session wins over the thread's stored id.
  const activeBridgeSession =
    bridgeSession ?? thread?.opencodeSessionId ?? null;

  // Keep the ref the (reconnect-stable) executor reads in step.
  useEffect(() => {
    bridgeSessionRef.current = activeBridgeSession;
  }, [activeBridgeSession]);

  // The bridge executor: claim → execute → post result. Exactly one tab
  // claims each call, so duplicate subscriptions never double-mutate.
  useEffect(() => {
    bridgeHandlerRef.current = (call) => {
      const sid = bridgeSessionRef.current;
      if (!sid || !projectId) {
        void postBridgeError(
          call.correlationId,
          sid ?? "",
          "No active MasarFlow project — open a chat inside a project first.",
        );
        return;
      }
      void (async () => {
        const claimed = await claimBridgeCall(call.correlationId, sid);
        if (!claimed) return; // another tab owns this call
        try {
          const result = await executeWorkspaceToolWithUndo(
            projectId,
            { id: call.correlationId, name: call.name, arguments: call.args },
            activeAssistantRef.current ?? "",
          );
          void postBridgeResult(call.correlationId, sid, result);
        } catch (e) {
          void postBridgeError(call.correlationId, sid, (e as Error).message);
        }
      })();
    };
  }, [projectId]);

  // SSE subscription: opencode server → Next → this browser. Re-subscribes
  // whenever the active session changes (thread switch, fresh load, repair,
  // or a newly created session via the session_created event handler).
  useEffect(() => {
    if (!projectId || !activeBridgeSession) return;
    const controller = new AbortController();
    subscribeBridge({
      sessionId: activeBridgeSession,
      signal: controller.signal,
      onCall: (call) => bridgeHandlerRef.current(call),
    });
    return () => controller.abort();
  }, [projectId, activeBridgeSession]);

  const mode = thread?.mode ?? "agentic";
  const backend: ChatBackend = thread?.backend ?? "opencode";
  const opencodeProvider = thread
    ? (models?.providers.find((p) => p.providerId === thread.providerId) ??
      null)
    : null;
  const opencodeModel =
    opencodeProvider && thread
      ? (opencodeProvider.models.find((m) => m.id === thread.modelId) ?? null)
      : null;
  // API backend: the thread's saved connection (falls back to the first one
  // so a thread made before any connection existed still has a target).
  const apiConnection: AiConnection | null =
    backend === "api" && thread
      ? (connections.find((c) => c.id === thread.connectionId) ??
        connections[0] ??
        null)
      : null;
  const apiProvider =
    catalog && apiConnection
      ? providerForConnection(catalog, apiConnection)
      : null;
  const ollamaProvider = catalog?.ollama ?? null;
  const canUseImages =
    backend === "opencode"
      ? (opencodeModel?.capabilities.attachment ?? false)
      : backend === "api" && apiProvider && thread
        ? modelSupportsImages(apiProvider, thread.modelId)
        : backend === "ollama" && ollamaProvider && thread
          ? modelSupportsImages(ollamaProvider, thread.modelId)
          : false;

  const speech = useSpeechInput({
    onTranscript: (text) =>
      setInput((v) => (v ? `${v.trimEnd()} ${text.trim()}` : text.trim())),
    onInterim: setInterim,
  });

  // Keep the view pinned to the latest message while streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, stream?.text, stream?.reasoning]);

  // Switching threads mid-turn abandons the in-flight request: abort it and
  // mark its message interrupted so the old thread never shows a blank or
  // permanently-"streaming" bubble.
  const threadSwitchRef = useRef<string | null>(threadId);
  useEffect(() => {
    const prev = threadSwitchRef.current;
    threadSwitchRef.current = threadId;
    if (prev !== threadId && abortRef.current) {
      turnGenRef.current++;
      abortRef.current.abort();
      abortRef.current = null;
      busyRef.current = false;
      setStream(null);
      rejectPendingApproval();
      const a = activeAssistantRef.current;
      activeAssistantRef.current = null;
      if (a) void chatMessagesRepo.markInterruptedIfStreaming(a);
    }
  }, [threadId]);

  // Abandon (not cancel) an in-flight turn when the component unmounts — the
  // fetch is aborted and the catch path persists an "interrupted" state.
  useEffect(
    () => () => {
      rejectPendingApproval();
      abortRef.current?.abort();
    },
    [],
  );

  // Refresh / navigation recovery: a message left mid-stream must resolve to
  // a real state, never a permanent spinner. Check the OpenCode session: if
  // it is still working, attach to the live turn (no duplicate request); if
  // it finished while we were away, reconstruct the reply from history; if
  // the session is gone, mark the message interrupted.
  useEffect(() => {
    if (!thread || !thread.opencodeSessionId) return;
    if (busyRef.current || stream) return;
    const streamingMsg = messages.find(
      (m) => m.role === "assistant" && m.status === "streaming",
    );
    if (!streamingMsg || recoveryHandledRef.current.has(streamingMsg.id))
      return;
    recoveryHandledRef.current.add(streamingMsg.id);
    void (async () => {
      const state = await getChatState(thread.opencodeSessionId);
      if (state.status === "busy") {
        await runTurn("", [], { resume: streamingMsg.id });
      } else if (state.status === "missing") {
        await chatMessagesRepo.markInterruptedIfStreaming(streamingMsg.id);
      } else {
        // idle: the turn already finished server-side — reconstruct it.
        try {
          const res = await fetch(
            `/api/opencode/history?sessionId=${encodeURIComponent(thread.opencodeSessionId)}&limit=5`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const data = (await res.json()) as {
              messages?: {
                info: { id: string; role: string; finish?: string };
                parts: OpenCodePart[];
              }[];
            };
            const lastAssistant = (data.messages ?? [])
              .filter((m) => m.info.role === "assistant")
              .at(-1);
            if (lastAssistant?.info.finish) {
              const text = lastAssistant.parts
                .filter((p) => p.type === "text")
                .map((p) => (p as OpenCodeTextPart).text ?? "")
                .join("");
              const reasoning = lastAssistant.parts
                .filter((p) => p.type === "reasoning")
                .map((p) => (p as OpenCodeReasoningPart).text ?? "")
                .join("");
              const tools = lastAssistant.parts
                .filter(
                  (p) =>
                    p.type === "tool" &&
                    (p as OpenCodeToolPart).state.status !== "pending",
                )
                .map((p) => {
                  const t = p as OpenCodeToolPart;
                  return {
                    name: t.tool,
                    summary: "",
                    ok: t.state.status === "completed",
                    running: false,
                  };
                });
              const files = lastAssistant.parts
                .filter((p) => p.type === "patch")
                .flatMap((p) => (p as OpenCodePatchPart).files ?? []);
              const didWork = Boolean(text.trim()) || tools.length > 0;
              await chatMessagesRepo.update(streamingMsg.id, {
                content: text,
                reasoning,
                toolActivity: tools,
                files,
                opencodeMessageId: lastAssistant.info.id,
                status: didWork ? "done" : "error",
                error: didWork
                  ? null
                  : "The response finished with no answer — Retry.",
              });
              return;
            }
          }
        } catch {
          // Fall through to the interrupted mark.
        }
        await chatMessagesRepo.markInterruptedIfStreaming(streamingMsg.id);
      }
    })();
  }, [threadId, thread, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleThreads = useMemo(() => {
    const q = threadQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, threadQuery]);

  function select(id: string | null) {
    router.replace(id ? `/chat?thread=${id}` : "/chat", { scroll: false });
  }

  async function newChat() {
    if (!projectId) return;
    const backendForNew: ChatBackend = defaultBackend;
    let firstModel = "";
    let providerId = "";
    let connectionId = "";

    if (backendForNew === "opencode") {
      // Chat runs on OpenCode's own provider configuration.
      let current = models;
      if (!current) {
        try {
          current = await fetchOpenCodeModels();
          setModels(current);
        } catch {
          setSendError(
            "The AI agent service is unavailable — start OpenCode (or run `npm run dev:full`) and try again.",
          );
          return;
        }
      }
      const providers = current.providers;
      if (providers.length === 0) {
        setSendError(
          "No AI providers are configured in OpenCode. Run `opencode auth` to add one, then create a new chat.",
        );
        return;
      }
      providerId = providers[0].providerId;
      firstModel = providers[0].models[0]?.id ?? "";
    } else if (backendForNew === "api") {
      if (connections.length === 0) {
        setConnDialog(true);
        setSendError(
          "No AI connections yet — add one (API key) to chat over the API.",
        );
        return;
      }
      const conn = connections[0];
      connectionId = conn.id;
      providerId = conn.providerId;
      const provider = catalog ? providerForConnection(catalog, conn) : null;
      firstModel = provider ? defaultModelId(provider) : "";
    } else {
      // Ollama — local, no key.
      if (!ollamaProvider || Object.keys(ollamaProvider.models).length === 0) {
        setSendError(
          "Ollama isn't reachable — start it (`ollama serve`) and try again.",
        );
        return;
      }
      providerId = "ollama";
      firstModel = defaultModelId(ollamaProvider);
    }

    const t = await chatThreadsRepo.create({
      projectId,
      backend: backendForNew,
      connectionId,
      modelId: firstModel,
      providerId,
    });
    if (backendForNew === "opencode") {
      void ensureSessionForThread(t.id).catch(() => {
        // Session creation is lazy anyway — the first send recreates it.
      });
    }
    select(t.id);
  }

  /** Create (or repair) the OpenCode session backing a thread. */
  async function ensureSessionForThread(
    threadId: string,
    directory?: string,
  ): Promise<string | null> {
    const t = threads.find((x) => x.id === threadId) ?? thread;
    if (!t) return null;
    try {
      const result = await ensureChatSession(threadId, directory);
      if (!result) return null;
      setBridgeSession(result.opencodeSessionId);
      await chatThreadsRepo.update(threadId, {
        opencodeSessionId: result.opencodeSessionId,
        opencodeDirectory: directory ?? t.opencodeDirectory ?? "",
      });
      return result.opencodeSessionId;
    } catch (e) {
      console.error("[chat] session ensure failed", e);
      return null;
    }
  }

  /** The working directory for a thread's OpenCode session. */
  function sessionDirectoryFor(): string | undefined {
    if (linkedRoots?.length === 1) return linkedRoots[0].rootPath;
    return thread?.opencodeDirectory || undefined;
  }

  /**
   * Switch a thread between the OpenCode / API / Ollama backends. Keeps the
   * conversation (messages persist in the DB) and fills sensible defaults for
   * the target backend. OpenCode sessions are left in place — harmless.
   */
  async function switchBackend(next: ChatBackend) {
    if (!thread || next === backend) return;
    const patch: Partial<ChatThread> & { backend: ChatBackend } = {
      backend: next,
    };
    if (next === "api") {
      const conn = connections[0];
      if (conn) {
        patch.connectionId = conn.id;
        patch.providerId = conn.providerId;
        const provider = catalog ? providerForConnection(catalog, conn) : null;
        patch.modelId = provider ? defaultModelId(provider) : "";
      }
    } else if (next === "ollama") {
      patch.connectionId = "";
      patch.providerId = "ollama";
      patch.modelId = ollamaProvider ? defaultModelId(ollamaProvider) : "";
    } else {
      // opencode — provider/model are picked from the OpenCode catalog; send()
      // fills defaults when the thread predates the switch.
      patch.connectionId = "";
    }
    await chatThreadsRepo.update(thread.id, patch);
  }

  async function deleteThread(id: string) {
    const t = threads.find((x) => x.id === id);
    await chatThreadsRepo.remove(id);
    if (t?.opencodeSessionId) {
      try {
        await fetch(
          `/api/opencode/session?sessionId=${encodeURIComponent(t.opencodeSessionId)}`,
          { method: "DELETE" },
        );
      } catch {
        // Best effort — orphan sessions are harmless and still listed in OpenCode.
      }
    }
    if (id === threadId) select(null);
  }

  /** Save a fenced code block from an assistant reply as a brain note. */
  async function saveCodeAsNote(code: string, language: string) {
    if (!projectId) return;
    const firstLine = code.split("\n").find((l) => l.trim()) ?? "snippet";
    const title =
      firstLine.replace(/^[#/\s*-]+/, "").slice(0, 60) || "Code snippet";
    await notesRepo.create({
      projectId,
      title,
      body: `\`\`\`${language}\n${code}\n\`\`\``,
      type: "note",
    });
  }

  /* ── Approval flow for OpenCode permission requests (fs/shell tools) ─── */

  /**
   * Reject any in-flight approval / question (Stop / thread switch / unmount).
   * Without this the agent would sit suspended forever on a request nothing
   * answers — the "stuck after a tool call" failure. Covers the OpenCode
   * permission flow, the OpenCode `question` tool, and the in-browser
   * fs/shell approval promise.
   */
  function rejectPendingApproval() {
    setPendingQuestion((q) => {
      if (q) {
        void rejectQuestion(q.questionId).catch(() => undefined);
      }
      return null;
    });
    setQuestionError(null);
    setLegacyApproval((p) => {
      if (p) p.resolve(false);
      return null;
    });
    setPendingApproval((p) => {
      if (p) {
        void approvePermission(p.sessionId, p.permissionId, "reject").catch(
          () => undefined,
        );
      }
      return null;
    });
  }

  function settleApproval(allowed: boolean, remember: boolean) {
    const p = pendingApproval;
    if (!p) return;
    setPendingApproval(null);
    void approvePermission(
      p.sessionId,
      p.permissionId,
      allowed ? (remember ? "always" : "once") : "reject",
    ).catch((e) => {
      console.error("[chat] approval reply failed", e);
      setSendError(
        `The approval reply failed: ${(e as Error).message} — the AI may be stuck; press Stop and retry.`,
      );
    });
  }

  /* ── Attachments ──────────────────────────────────────────────────── */

  async function addFiles(files: FileList | File[]) {
    setAttachError(null);
    for (const file of Array.from(files)) {
      try {
        const prepared = await prepareAttachment(file);
        if (prepared.image && !canUseImages) {
          setAttachError(
            `${file.name}: the selected model can't see images — pick a vision-capable model or attach text files.`,
          );
          continue;
        }
        setPending((p) => [...p, prepared]);
      } catch (e) {
        setAttachError((e as Error).message);
      }
    }
  }

  function onFilePick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void addFiles(e.target.files);
    e.target.value = "";
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  /* ── Mention menu (/ @ #) ─────────────────────────────────────────── */

  /** Recompute the active trigger + popover anchor from the live textarea. */
  function updateTrigger() {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const trig = detectTrigger(ta.value, pos);
    if (trig) {
      const coords = getCaretCoordinates(ta, pos);
      setTrigger(trig);
      setAnchor(coords);
    } else {
      setTrigger(null);
    }
  }

  function onMentionSelect(result: MenuResult) {
    const ta = textareaRef.current;
    if (!ta || !trigger) return;
    const before = ta.value.slice(0, trigger.start);
    const after = ta.value.slice(trigger.end);
    setTrigger(null);
    setAnchor(null);

    if (result.type === "command") {
      const insert = result.command.insert;
      const next = before + insert + after;
      setInput(next);
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (!t) return;
        const range = firstPlaceholderRange(insert);
        if (range) {
          t.setSelectionRange(
            before.length + range.start,
            before.length + range.end,
          );
        } else {
          const p = (before + insert).length;
          t.setSelectionRange(p, p);
        }
        t.focus();
      });
      return;
    }

    if (result.type === "page") {
      const token = pageToken(result.item.label);
      setInput(`${before}${token} ${after}`);
      setMentions((ms) => [
        ...ms,
        {
          uid: newMentionUid(),
          kind: "page",
          token,
          label: result.item.label,
          href: result.item.href,
        },
      ]);
      focusAfter(before.length + token.length + 1);
      return;
    }

    const token = recordToken(result.item.kind, result.item.title);
    setInput(`${before}${token} ${after}`);
    setMentions((ms) => [
      ...ms,
      {
        uid: newMentionUid(),
        kind: "record",
        token,
        recordKind: result.item.kind,
        recordId: result.item.id,
        title: result.item.title,
      },
    ]);
    focusAfter(before.length + token.length + 1);
  }

  /** Move the caret to `pos` and refocus the textarea on the next frame. */
  function focusAfter(pos: number) {
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(pos, pos);
    });
  }

  function removeMention(uid: string) {
    const m = mentions.find((x) => x.uid === uid);
    if (!m) return;
    setInput((v) => stripMentionToken(v, m.token));
    setMentions((ms) => ms.filter((x) => x.uid !== uid));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  /* ── Sending ──────────────────────────────────────────────────────── */

  /**
   * Run one assistant turn through the thread's backend: the OpenCode server
   * (tools executed server-side), or the in-browser Agent Loop for the API /
   * Ollama backends.
   */
  async function runTurn(
    userText: string,
    attachments: ChatAttachment[],
    opts: { replaceId?: string; resume?: string } = {},
  ) {
    if (thread?.backend === "api" || thread?.backend === "ollama") {
      return runLegacyTurn(userText, attachments, opts);
    }
    return runOpencodeTurn(userText, attachments, opts);
  }

  /**
   * Run one assistant turn through the OpenCode backend. OpenCode keeps the
   * conversation history itself (persistent session per chat), so only the
   * new user text, attachments, and the workspace briefing travel here.
   */
  async function runOpencodeTurn(
    userText: string,
    attachments: ChatAttachment[],
    opts: { replaceId?: string; resume?: string } = {},
  ) {
    if (!thread) {
      busyRef.current = false;
      return;
    }
    busyRef.current = true;
    userCancelledRef.current = false;
    const gen = ++turnGenRef.current;
    const assistant = opts.resume
      ? await chatMessagesRepo.get(opts.resume).then(
          (m) =>
            m ??
            chatMessagesRepo.create({
              threadId: thread.id,
              role: "assistant",
              content: "",
              status: "streaming",
            }),
        )
      : await chatMessagesRepo.create({
          threadId: thread.id,
          role: "assistant",
          content: "",
          status: "streaming",
        });
    activeAssistantRef.current = assistant.id;
    setStream({
      id: assistant.id,
      text: "",
      reasoning: "",
      tools: [],
      notices: [],
      files: [],
    });
    const controller = new AbortController();
    abortRef.current = controller;

    // Accumulators live outside the try so a failed/stopped turn can still
    // persist whatever already streamed (partial answers and thinking stay
    // visible instead of vanishing when the error is saved).
    let acc = "";
    let reasoningAcc = "";
    let tools: ToolActivity[] = [];
    let notices: string[] = [];
    let files: string[] = [];
    let opencodeMessageId = "";
    let lastError: string | null = null;
    let sessionId = thread.opencodeSessionId;

    /** Only the current generation may touch live UI state. */
    const finishState = () => {
      if (gen !== turnGenRef.current) return;
      setStream(null);
      abortRef.current = null;
      busyRef.current = false;
      activeAssistantRef.current = null;
    };

    /** Persist the turn's terminal state exactly once, then settle the UI. */
    const saveTerminal = async (patch: Partial<ChatMessage>) => {
      try {
        await chatMessagesRepo.update(assistant.id, patch);
        if (opts.replaceId && opts.replaceId !== assistant.id) {
          await chatMessagesRepo.remove(opts.replaceId);
        }
      } catch (e) {
        console.error("[chat] failed to persist terminal message state", e);
      } finally {
        finishState();
      }
    };

    const toolIndexById = new Map<string, number>();
    const summarize = (args: Record<string, unknown>): string => {
      const s = (k: string): string | undefined => {
        const v = args[k];
        return typeof v === "string" && v.trim() ? v : undefined;
      };
      const title = s("title") ?? s("name") ?? s("command") ?? s("path");
      if (title) return title.slice(0, 80);
      if (s("query")) return `"${s("query")!.slice(0, 60)}"`;
      return "";
    };

    const push = () => {
      if (gen !== turnGenRef.current) return;
      setStream({
        id: assistant.id,
        text: acc,
        reasoning: reasoningAcc,
        tools: [...tools],
        notices: [...notices],
        files: [...files],
      });
    };

    const onEvent = (e: OpenCodeFrontendEvent) => {
      if (gen !== turnGenRef.current || !thread) return;
      switch (e.type) {
        case "text":
          acc += e.text;
          break;
        case "reasoning":
          reasoningAcc += e.text;
          break;
        case "step":
          if (e.step > 1 && acc) acc += "\n\n";
          break;
        case "notice":
          notices.push(e.message);
          break;
        case "tool_call":
          toolIndexById.set(e.id, tools.length);
          tools.push({
            name: e.name,
            summary: summarize(e.arguments),
            ok: true,
            running: true,
          });
          break;
        case "tool_running": {
          const i = toolIndexById.get(e.id);
          if (i !== undefined && e.title)
            tools[i] = { ...tools[i], summary: e.title };
          break;
        }
        case "tool_result": {
          const i = toolIndexById.get(e.id);
          if (i !== undefined)
            tools[i] = { ...tools[i], ok: e.ok, running: false };
          break;
        }
        case "file":
          if (!files.includes(e.path)) files.push(e.path);
          break;
        case "approval":
          setPendingApproval({
            permissionId: e.permissionId,
            sessionId,
            type: e.permissionType,
            title: e.title,
            pattern: e.pattern,
          });
          break;
        case "question":
          setQuestionError(null);
          setPendingQuestion({
            questionId: e.questionId,
            sessionId: e.sessionId,
            questions: e.questions,
          });
          break;
        case "question_dismissed":
          setPendingQuestion(null);
          setQuestionError(null);
          break;
        case "session_created":
          sessionId = e.sessionId;
          setBridgeSession(e.sessionId);
          void chatThreadsRepo.update(thread.id, {
            opencodeSessionId: e.sessionId,
            opencodeDirectory: sessionDirectoryFor() ?? "",
          });
          break;
        case "message_id":
          opencodeMessageId = e.messageId;
          break;
        case "resumed":
          // Re-attached to a running turn: fresh snapshot replaces the UI.
          acc = "";
          reasoningAcc = "";
          tools = [];
          files = [];
          notices = [];
          break;
        case "error":
          lastError = e.message;
          break;
        default:
          break;
      }
      push();
    };

    try {
      const agentic = mode === "agentic";
      const directory = sessionDirectoryFor();
      // Ensure the session (or repair a stale id) before sending. When the
      // stored id is gone the backend recreates it and emits session_created.
      if (!sessionId) {
        const ensured = await ensureSessionForThread(thread.id, directory);
        if (ensured) sessionId = ensured;
      }
      // Agentic turns are grounded in the live workspace briefing; chat turns
      // talk to the model directly (OpenCode still supplies its own rules).
      // The toolbelt describes exactly what the server can execute: the
      // workspace functions (mutate the project DB via the bridge) when they
      // are registered, plus the real filesystem tools OpenCode exposes —
      // never phantom tools the model cannot actually call.
      const context = agentic
        ? await buildAgentSystemPrompt({
            projectId: projectId!,
            query: userText,
            withTools: true,
            toolbelt: registeredWorkspaceTools.length ? "hybrid" : "filesystem",
            linkedRoots: (linkedRoots ?? []).map((r) => ({
              name: r.name,
              rootPath: r.rootPath,
            })),
            workspaceTools: registeredWorkspaceTools,
            filesystemTools: nativeFsTools,
            filesystemNote: linkedRoots?.length
              ? undefined
              : "The filesystem/shell tools are rooted in the MasarFlow workspace folder. To work on an external folder (e.g. a web app, a Unity game, or any other codebase), the user must link it from the chat header (folder icon) — until then you cannot reach other folders on the machine.",
            signal: controller.signal,
          })
        : null;
      if (context?.trimmed) {
        notices.push(
          "Workspace briefing trimmed to fit the model context window.",
        );
      }

      await sendTurn({
        chatId: thread.id,
        sessionId: sessionId || undefined,
        directory,
        providerId: thread.providerId || undefined,
        modelId: thread.modelId || undefined,
        system: context?.system ?? undefined,
        text: userText,
        attachments: attachments.length
          ? attachments.map((a) => ({
              name: a.name,
              mimeType: a.mimeType,
              kind: a.kind,
              dataUrl: a.dataUrl,
              textContent: a.textContent,
            }))
          : undefined,
        toolsEnabled: agentic,
        resume: Boolean(opts.resume),
        requestId: newRequestId(),
        signal: controller.signal,
        onEvent,
      });

      if (gen !== turnGenRef.current) return;
      const userCancelled =
        userCancelledRef.current || controller.signal.aborted;
      if (userCancelled) {
        await saveTerminal({
          content: acc,
          reasoning: reasoningAcc,
          toolActivity: tools,
          notices,
          files,
          opencodeMessageId,
          status: "cancelled",
          error: "Stopped.",
        });
        return;
      }
      if (lastError) {
        await saveTerminal({
          content: acc,
          reasoning: reasoningAcc,
          toolActivity: tools,
          notices,
          files,
          opencodeMessageId,
          status: "error",
          error: lastError,
        });
        return;
      }
      // Never leave a silent blank bubble: no text, no tools, no edits →
      // a retryable error.
      const didWork =
        Boolean(acc.trim()) || tools.length > 0 || files.length > 0;
      await saveTerminal({
        content: acc,
        reasoning: reasoningAcc,
        toolActivity: tools,
        notices,
        files,
        opencodeMessageId,
        status: didWork ? "done" : "error",
        error: didWork
          ? null
          : "The model returned an empty response — Retry, or pick a different model.",
      });
    } catch (e) {
      // Only the user pressing Stop is a cancellation; everything else —
      // timeouts, network failures, service errors, unmount/thread aborts —
      // is a real error the user can Retry.
      const userCancelled =
        userCancelledRef.current || controller.signal.aborted;
      const message = userCancelled
        ? "Stopped."
        : (e as Error).message || "The AI request failed — Retry to continue.";
      await saveTerminal({
        content: acc,
        reasoning: reasoningAcc,
        toolActivity: tools,
        notices,
        files,
        opencodeMessageId,
        status: userCancelled ? "cancelled" : "error",
        error: message,
      });
    }
  }

  /**
   * Run one assistant turn through the in-browser Agent Loop (API connection
   * or local Ollama): history is rebuilt from the stored messages, the
   * workspace tools + linked-folder fs/shell tools execute in the browser
   * with per-action approval, and everything streams through the same
   * NDJSON event shapes the OpenCode path emits.
   */
  async function runLegacyTurn(
    userText: string,
    attachments: ChatAttachment[],
    opts: { replaceId?: string } = {},
  ) {
    if (!thread) {
      busyRef.current = false;
      return;
    }
    // Re-read the freshest thread state — send() may have just persisted
    // backend defaults (connection/model) that the render closure misses.
    const t = (await chatThreadsRepo.get(thread.id)) ?? thread;
    if (!catalog) {
      busyRef.current = false;
      setSendError("AI providers are still loading — wait a moment and retry.");
      return;
    }
    busyRef.current = true;
    userCancelledRef.current = false;
    const gen = ++turnGenRef.current;
    const assistant = await chatMessagesRepo.create({
      threadId: t.id,
      role: "assistant",
      content: "",
      status: "streaming",
    });
    activeAssistantRef.current = assistant.id;
    setStream({
      id: assistant.id,
      text: "",
      reasoning: "",
      tools: [],
      notices: [],
      files: [],
    });
    const controller = new AbortController();
    abortRef.current = controller;

    // Accumulators live outside the try so a failed/stopped turn can still
    // persist whatever already streamed.
    let acc = "";
    let reasoningAcc = "";
    const tools: ToolActivity[] = [];
    const notices: string[] = [];
    const files: string[] = [];
    let lastError: string | null = null;

    /** Only the current generation may touch live UI state. */
    const finishState = () => {
      if (gen !== turnGenRef.current) return;
      setStream(null);
      abortRef.current = null;
      busyRef.current = false;
      activeAssistantRef.current = null;
    };

    /** Persist the turn's terminal state exactly once, then settle the UI. */
    const saveTerminal = async (patch: Partial<ChatMessage>) => {
      try {
        await chatMessagesRepo.update(assistant.id, patch);
        if (opts.replaceId && opts.replaceId !== assistant.id) {
          await chatMessagesRepo.remove(opts.replaceId);
        }
      } catch (e) {
        console.error("[chat] failed to persist terminal message state", e);
      } finally {
        finishState();
      }
    };

    const toolIndexById = new Map<string, number>();
    const summarize = (args: Record<string, unknown>): string => {
      const s = (k: string): string | undefined => {
        const v = args[k];
        return typeof v === "string" && v.trim() ? v : undefined;
      };
      const title = s("title") ?? s("name") ?? s("command") ?? s("path");
      if (title) return title.slice(0, 80);
      if (s("query")) return `"${s("query")!.slice(0, 60)}"`;
      return "";
    };

    const push = () => {
      if (gen !== turnGenRef.current) return;
      setStream({
        id: assistant.id,
        text: acc,
        reasoning: reasoningAcc,
        tools: [...tools],
        notices: [...notices],
        files: [...files],
      });
    };

    // ── Resolve the backend context ────────────────────────────────────
    const agentic = t.mode === "agentic";
    let provider: AiProvider | null = null;
    let apiKey = "";
    let baseUrl: string | undefined;
    if (t.backend === "ollama") {
      provider = catalog.ollama ?? null;
      if (!provider || Object.keys(provider.models).length === 0) {
        await saveTerminal({
          content: acc,
          status: "error",
          error:
            "Ollama isn't reachable — start it (`ollama serve`) and retry.",
        });
        return;
      }
    } else {
      const conn = connections.find((c) => c.id === t.connectionId) ?? null;
      if (!conn) {
        await saveTerminal({
          content: acc,
          status: "error",
          error:
            "No AI connection is selected — pick one from the header and retry.",
        });
        return;
      }
      provider = providerForConnection(catalog, conn);
      if (!provider) {
        await saveTerminal({
          content: acc,
          status: "error",
          error:
            "The connection's provider isn't in the catalog — pick another connection.",
        });
        return;
      }
      apiKey = conn.apiKey;
      baseUrl = conn.baseUrl.trim() || undefined;
    }
    const modelId = t.modelId || defaultModelId(provider);
    const withTools = agentic && modelSupportsTools(provider, modelId);
    if (agentic && !withTools) {
      notices.push(
        "The selected model can't call tools — this turn is chat-only. Pick a tool-capable model to use agentic mode.",
      );
    }
    const requestId = newRequestId();

    try {
      // Agentic turns are grounded in the live workspace briefing; the tool
      // guidance matches what the browser Agent Loop can actually execute.
      const context = agentic
        ? await buildAgentSystemPrompt({
            projectId: projectId!,
            query: userText,
            withTools,
            toolbelt: withTools ? "workspace" : undefined,
            linkedRoots: (linkedRoots ?? []).map((r) => ({
              name: r.name,
              rootPath: r.rootPath,
            })),
            signal: controller.signal,
          })
        : null;
      if (context?.trimmed) {
        notices.push(
          "Workspace briefing trimmed to fit the model context window.",
        );
      }
      push();

      const { text, images } = attachmentsToWire(attachments);
      const content = text ? `${userText}\n\n${text}` : userText;
      const wireMessages: WireMessage[] = [
        ...buildLegacyMessages(messages),
        {
          role: "user",
          content,
          images: images.length ? images : undefined,
        },
      ];

      await runWorkspaceChat({
        provider,
        apiKey,
        baseUrl,
        model: modelId,
        system: context?.system ?? undefined,
        messages: wireMessages,
        tools: withTools ? [...WORKSPACE_TOOLS, ...FS_TOOLS] : undefined,
        maxRounds: 8,
        executeTool: withTools
          ? async (call) => {
              if (FS_TOOL_NAMES.has(call.name)) {
                return executeFsTool(
                  {
                    roots: linkedRoots ?? [],
                    requestApproval: (request) =>
                      new Promise<boolean>((resolve) => {
                        if (controller.signal.aborted) {
                          resolve(false);
                          return;
                        }
                        setLegacyApproval({ request, resolve });
                      }),
                    signal: controller.signal,
                    requestId,
                  },
                  call,
                );
              }
              return executeWorkspaceToolWithUndo(
                projectId!,
                call,
                assistant.id,
              );
            }
          : undefined,
        reasoning:
          t.reasoningEnabled && modelSupportsReasoning(provider, modelId)
            ? { enabled: true, budget: 8000 }
            : undefined,
        signal: controller.signal,
        onEvent: (e: StreamEvent) => {
          if (gen !== turnGenRef.current) return;
          switch (e.type) {
            case "text":
              acc += e.text;
              break;
            case "reasoning":
              reasoningAcc += e.text;
              break;
            case "round":
              if (e.round > 0 && acc) acc += "\n\n";
              break;
            case "notice":
              notices.push(e.message);
              break;
            case "tool_call":
              toolIndexById.set(e.id, tools.length);
              tools.push({
                name: e.name,
                summary: summarize(e.arguments),
                ok: true,
                running: true,
              });
              break;
            case "tool_result": {
              const i = toolIndexById.get(e.id);
              if (i !== undefined)
                tools[i] = { ...tools[i], ok: e.ok, running: false };
              break;
            }
            case "error":
              lastError = e.message;
              break;
          }
          push();
        },
      });

      if (gen !== turnGenRef.current) return;
      const userCancelled =
        userCancelledRef.current || controller.signal.aborted;
      if (userCancelled) {
        await saveTerminal({
          content: acc,
          reasoning: reasoningAcc,
          toolActivity: tools,
          notices,
          files,
          status: "cancelled",
          error: "Stopped.",
        });
        return;
      }
      if (lastError) {
        await saveTerminal({
          content: acc,
          reasoning: reasoningAcc,
          toolActivity: tools,
          notices,
          files,
          status: "error",
          error: lastError,
        });
        return;
      }
      // Never leave a silent blank bubble: no text and no tools → retryable.
      const didWork = Boolean(acc.trim()) || tools.length > 0;
      await saveTerminal({
        content: acc,
        reasoning: reasoningAcc,
        toolActivity: tools,
        notices,
        files,
        status: didWork ? "done" : "error",
        error: didWork
          ? null
          : "The model returned an empty response — Retry, or pick a different model.",
      });
    } catch (e) {
      const userCancelled =
        userCancelledRef.current || controller.signal.aborted;
      const message =
        userCancelled || e instanceof ChatAbortError
          ? "Stopped."
          : (e as Error).message ||
            "The AI request failed — Retry to continue.";
      await saveTerminal({
        content: acc,
        reasoning: reasoningAcc,
        toolActivity: tools,
        notices,
        files,
        status: userCancelled ? "cancelled" : "error",
        error: message,
      });
    }
  }

  async function send() {
    if (!thread || busyRef.current || stream) return;
    const text = input.trim();
    if (!text && pending.length === 0) return;

    if (backend === "opencode") {
      if (!models) {
        setSendError("Loading AI providers from OpenCode…");
        return;
      }
      if (models.providers.length === 0) {
        setSendError(
          "No AI providers are configured in OpenCode. Run `opencode auth` to add one, then try again.",
        );
        return;
      }
      // Agentic mode needs a model that can actually call tools — otherwise
      // the chat is honest but useless ("I can't touch the filesystem").
      if (
        mode === "agentic" &&
        opencodeModel &&
        !opencodeModel.capabilities.toolcall
      ) {
        setSendError(
          "This model can't call tools, so agentic mode can't act on files. Pick a tool-capable model (wrench icon) or switch to Chat mode.",
        );
        return;
      }
      // A thread created before providers existed needs a default selection.
      if (!thread.providerId || !thread.modelId) {
        const firstProvider = models.providers[0];
        await chatThreadsRepo.update(thread.id, {
          providerId: thread.providerId || firstProvider.providerId,
          modelId: thread.modelId || firstProvider.models[0]?.id || "",
        });
      }
    } else if (backend === "api") {
      if (!catalog) {
        setSendError(
          "AI providers are still loading — wait a moment and retry.",
        );
        return;
      }
      if (connections.length === 0) {
        setConnDialog(true);
        setSendError(
          "No AI connections yet — add one (an API key) to chat over the API.",
        );
        return;
      }
      if (!apiConnection) {
        setSendError("Select an AI connection from the header and retry.");
        return;
      }
      if (!apiProvider) {
        setSendError(
          "The connection's provider isn't in the catalog — pick another connection.",
        );
        return;
      }
      if (!apiProvider.noAuth && !apiConnection.apiKey) {
        setConnDialog(true);
        setSendError(
          `"${apiConnection.label}" has no API key — add one in the connections dialog.`,
        );
        return;
      }
      if (
        mode === "agentic" &&
        !modelSupportsTools(apiProvider, thread.modelId)
      ) {
        setSendError(
          "This model can't call tools, so agentic mode can't act on your workspace. Pick a tool-capable model or switch to Chat mode.",
        );
        return;
      }
      // Persist the defaults a thread predating the API backend may lack.
      if (!thread.connectionId || !thread.providerId || !thread.modelId) {
        await chatThreadsRepo.update(thread.id, {
          connectionId: apiConnection.id,
          providerId: apiConnection.providerId,
          modelId: thread.modelId || defaultModelId(apiProvider),
        });
      }
    } else {
      // ollama
      if (!catalog?.ollama || Object.keys(catalog.ollama.models).length === 0) {
        setSendError(
          "Ollama isn't reachable — start it (`ollama serve`) and try again.",
        );
        return;
      }
      if (!thread.providerId || !thread.modelId) {
        await chatThreadsRepo.update(thread.id, {
          providerId: "ollama",
          modelId: thread.modelId || defaultModelId(catalog.ollama),
        });
      }
    }
    // One turn at a time: flip the synchronous guard before any await so a
    // fast double-Enter can never start a second concurrent turn.
    busyRef.current = true;
    // Dedupe: a user message identical to the most recent one, sent within
    // 2s, is a double-fire — drop the duplicate without starting a turn.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser && isDuplicateUserMessage(lastUser, text)) {
      busyRef.current = false;
      return;
    }
    setSendError(null);
    try {
      const attachments = pending.map((p) => p.attachment);
      // Resolve `#` record mentions into file attachments so their full bodies
      // are inlined as context (works in any chat mode). Persisting them as
      // attachments means the thread keeps them for regenerate too.
      const mentionAttachments: ChatAttachment[] = [];
      for (const m of mentions) {
        if (m.kind !== "record") continue;
        const r = await resolveRecordMention(projectId!, m);
        if (r && r.body.trim()) {
          mentionAttachments.push({
            name: `${m.recordKind}: ${r.title}`,
            kind: "file",
            mimeType: "text/markdown",
            dataUrl: "",
            textContent: r.body,
          });
        }
      }
      const allAttachments = [...attachments, ...mentionAttachments];
      setInput("");
      setPending([]);
      setMentions([]);
      setTrigger(null);
      setAnchor(null);
      setAttachError(null);

      await chatMessagesRepo.create({
        threadId: thread.id,
        role: "user",
        content: text,
        attachments: allAttachments,
      });
      if (thread.title === "New chat") {
        const title = text || attachments[0]?.name || "New chat";
        await chatThreadsRepo.update(thread.id, {
          title: title.slice(0, 48) + (title.length > 48 ? "…" : ""),
        });
      } else {
        await chatThreadsRepo.update(thread.id, {});
      }
      await runTurn(text, allAttachments);
    } catch (e) {
      console.error("[chat] send failed", e);
      busyRef.current = false;
      setSendError((e as Error).message || "The AI request failed — Retry.");
    }
  }

  /** Re-run the assistant reply that follows the last user message. */
  async function regenerate(assistantId: string) {
    if (!thread || busyRef.current || stream) return;
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx === -1) return;
    // Find the user turn this reply answered.
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== "user") userIdx--;
    if (userIdx < 0) return;
    const userMsg = messages[userIdx];
    // The old reply is replaced only once the new turn reaches a terminal
    // state (see runTurn's saveTerminal) — a failed retry never destroys it.
    await runTurn(userMsg.content, userMsg.attachments ?? [], {
      replaceId: assistantId,
    });
  }

  /** Undo an assistant message's file changes (OpenCode snapshot revert). */
  async function undoAssistant(assistantId: string) {
    if (!thread || !thread.opencodeSessionId) return;
    const m = messages.find((x) => x.id === assistantId);
    if (!m?.opencodeMessageId) return;
    const result = await undoChatMessage(
      thread.opencodeSessionId,
      m.opencodeMessageId,
    );
    if (!result.ok) {
      setSendError(result.error ?? "Undo failed.");
    }
  }

  function stop() {
    // Only a real user click marks the turn as cancelled — timeouts and
    // connection failures go through the error path, never "Stopped.".
    userCancelledRef.current = true;
    console.info("[chat] turn cancelled by user");
    rejectPendingApproval();
    abortRef.current?.abort();
    void abortChatTurn(thread?.opencodeSessionId || undefined);
  }

  const sendDisabled =
    (!input.trim() && pending.length === 0) || Boolean(stream);

  return (
    <div className="flex h-full min-h-0">
      {/* Threads sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={newChat}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" /> New chat
          </Button>
          {backend === "opencode" && !opencodeHealthy && (
            <Tooltip
              label="The AI agent service is unreachable — start OpenCode or run `npm run dev:full`."
              side="bottom"
            >
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="OpenCode unavailable"
                onClick={() => setOpencodeHealthy(false)}
              >
                <AlertCircle className="h-4 w-4 text-destructive" />
              </Button>
            </Tooltip>
          )}
        </div>
        {threads.length > 3 && (
          <div className="relative border-b border-border p-2">
            <Search className="absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={threadQuery}
              onChange={(e) => setThreadQuery(e.target.value)}
              placeholder="Search chats…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        )}
        <ScrollArea className="flex-1 p-2">
          {visibleThreads.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {threads.length === 0 ? "No chats yet." : "No matches."}
            </p>
          ) : (
            visibleThreads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === threadId}
                onSelect={() => select(t.id)}
                onDelete={() => deleteThread(t.id)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!thread ? (
          <EmptyState
            icon={MessageSquare}
            title={opencodeHealthy ? "Start a chat" : "AI agent unavailable"}
            description={
              opencodeHealthy
                ? "Pick a backend from the header (OpenCode · API · Local Ollama), choose a provider and model, then send a message. OpenCode manages its own provider keys (`opencode auth`); API keys you add live in your browser only."
                : "The OpenCode server isn't reachable — switch a chat to the API or Local (Ollama) backend, or start OpenCode with `npm run dev:full` (it spawns `opencode serve`)."
            }
            action={
              <Button
                onClick={() => {
                  if (opencodeHealthy) {
                    void newChat();
                  } else {
                    void checkOpenCodeHealth().then((h) => {
                      setOpencodeHealthy(h.ok);
                      if (h.ok) {
                        void fetchOpenCodeModels(true)
                          .then(setModels)
                          .catch(() => {});
                        void newChat();
                      }
                    });
                  }
                }}
                disabled={!projectId}
              >
                <Plus className="h-4 w-4" /> New chat
              </Button>
            }
          />
        ) : (
          <>
            {/* Header: backend + provider/model + mode + linked projects.
               No overflow here — an overflow container would clip the open
               provider/model dropdowns (they anchor with position:absolute). */}
            <div className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
              <BackendSwitch
                backend={backend}
                onChange={(b) => void switchBackend(b)}
              />

              {backend === "opencode" && opencodeHealthy && (
                <OpenCodeProviderMenu
                  providers={models?.providers ?? []}
                  value={thread.providerId}
                  onChange={(providerId) => {
                    const provider = models?.providers.find(
                      (p) => p.providerId === providerId,
                    );
                    chatThreadsRepo.update(thread.id, {
                      providerId,
                      modelId: provider?.models[0]?.id ?? "",
                    });
                  }}
                />
              )}
              {backend === "opencode" &&
                opencodeHealthy &&
                opencodeProvider && (
                  <OpenCodeModelMenu
                    models={opencodeProvider.models}
                    value={thread.modelId}
                    onChange={(m) =>
                      chatThreadsRepo.update(thread.id, { modelId: m })
                    }
                  />
                )}

              {backend === "api" && (
                <>
                  <ConnectionMenu
                    connections={connections}
                    value={apiConnection?.id ?? thread.connectionId}
                    onChange={(connectionId) => {
                      const conn = connections.find(
                        (c) => c.id === connectionId,
                      );
                      if (!conn) return;
                      const provider = catalog
                        ? providerForConnection(catalog, conn)
                        : null;
                      chatThreadsRepo.update(thread.id, {
                        connectionId,
                        providerId: conn.providerId,
                        modelId: provider
                          ? defaultModelId(provider)
                          : thread.modelId,
                      });
                    }}
                    onManage={() => setConnDialog(true)}
                  />
                  {apiProvider && (
                    <CatalogModelMenu
                      models={modelsForProvider(apiProvider)}
                      value={thread.modelId}
                      onChange={(m) =>
                        chatThreadsRepo.update(thread.id, { modelId: m })
                      }
                    />
                  )}
                </>
              )}

              {backend === "ollama" && (
                <CatalogModelMenu
                  models={
                    ollamaProvider ? modelsForProvider(ollamaProvider) : []
                  }
                  value={thread.modelId}
                  offline={
                    !ollamaProvider ||
                    Object.keys(ollamaProvider.models).length === 0
                  }
                  onChange={(m) =>
                    chatThreadsRepo.update(thread.id, { modelId: m })
                  }
                />
              )}

              <ModeToggle
                mode={mode}
                onChange={(m) => chatThreadsRepo.update(thread.id, { mode: m })}
              />

              {mode === "agentic" && (
                <Tooltip
                  label={
                    linkedRoots?.length
                      ? `Linked projects: ${linkedRoots.map((r) => r.name).join(", ")} — the AI can read them freely and asks before writes/commands`
                      : backend === "opencode"
                        ? "Link an external project folder (e.g. a web app, a Unity game, or any codebase) — the AI's filesystem tools (fs_list/fs_read/fs_search/fs_write/shell) then run in it. Without a link they stay inside the MasarFlow workspace."
                        : "Link an external project folder (e.g. a web app, a Unity game, or any codebase) — the AI's filesystem tools (fs_list/fs_read/fs_search/fs_write/shell_run) then run in it. Without a link only the workspace tools are available."
                  }
                  side="bottom"
                >
                  <Button
                    variant={linkedRoots?.length ? "default" : "outline"}
                    size="icon-sm"
                    aria-label="Linked projects"
                    onClick={() => setLinkDialog(true)}
                  >
                    <FolderGit2 className="h-4 w-4" />
                  </Button>
                </Tooltip>
              )}

              <span
                className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground lg:inline-flex"
                title={
                  mode === "agentic"
                    ? "Every turn is grounded in your live workspace and the assistant can read, write, and run commands via tools."
                    : "Direct conversation with the model — no workspace context is sent."
                }
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {mode === "agentic"
                  ? `Agentic${linkedRoots?.length ? ` · +${linkedRoots.length} linked` : ""}`
                  : "Direct chat"}
              </span>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div
                className={cn(
                  "mx-auto max-w-3xl px-5 py-5",
                  density === "compact" ? "space-y-2.5" : "space-y-5",
                )}
              >
                {messages.length === 0 && (
                  <Suggestions
                    mode={mode}
                    onPick={(s) => {
                      setInput(s);
                    }}
                  />
                )}
                {messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    live={stream?.id === m.id ? stream : null}
                    showTimestamps={showTimestamps}
                    busy={Boolean(stream)}
                    onCopy={() => navigator.clipboard.writeText(m.content)}
                    onDelete={() => chatMessagesRepo.remove(m.id)}
                    onRegenerate={() => void regenerate(m.id)}
                    onSaveCodeAsNote={saveCodeAsNote}
                    onUndoFiles={
                      m.opencodeMessageId && thread.opencodeSessionId
                        ? () => void undoAssistant(m.id)
                        : undefined
                    }
                  />
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="shrink-0 border-t border-border p-3">
              <div className="mx-auto max-w-3xl">
                {pendingApproval && (
                  <ApprovalCard
                    type={pendingApproval.type}
                    title={pendingApproval.title}
                    pattern={pendingApproval.pattern}
                    onSettle={settleApproval}
                  />
                )}
                {legacyApproval && (
                  <ApprovalCard
                    type={legacyApproval.request.name}
                    title={
                      legacyApproval.request.name === "shell_run"
                        ? String(legacyApproval.request.arguments.command ?? "")
                        : String(legacyApproval.request.arguments.path ?? "")
                    }
                    pattern={legacyApproval.request.rootLabel}
                    allowRemember={false}
                    onSettle={(allowed) => {
                      legacyApproval.resolve(allowed);
                      setLegacyApproval(null);
                    }}
                  />
                )}
                {attachError && (
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />{" "}
                    {attachError}
                  </p>
                )}
                {sendError && (
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {sendError}
                  </p>
                )}
                {pending.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pending.map((p, i) => (
                      <span
                        key={`${p.attachment.name}-${i}`}
                        className="group relative inline-flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1 text-xs"
                      >
                        {p.attachment.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.attachment.dataUrl}
                            alt={p.attachment.name}
                            className="h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="max-w-36 truncate">
                          {p.attachment.name}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${p.attachment.name}`}
                          onClick={() =>
                            setPending((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {mentions.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {mentions.map((m) => (
                      <span
                        key={m.uid}
                        className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs"
                      >
                        {m.kind === "page" ? (
                          <AtSign className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Hash className="h-3.5 w-3.5 text-primary" />
                        )}
                        <span className="max-w-40 truncate">
                          {m.kind === "page" ? m.label : `#${m.title}`}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${m.token}`}
                          onClick={() => removeMention(m.uid)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative flex items-end gap-2 rounded-lg border border-border bg-card p-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={
                      canUseImages
                        ? "image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.cs,.sql,.sh,.toml,.log"
                        : ".txt,.md,.json,.csv,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.cs,.sql,.sh,.toml,.log"
                    }
                    onChange={onFilePick}
                    className="hidden"
                  />
                  <Tooltip
                    label={
                      canUseImages
                        ? "Attach images or text files"
                        : "Attach text files (this model can't see images)"
                    }
                    side="top"
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Attach files"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={Boolean(stream)}
                    >
                      {canUseImages ? (
                        <ImageIcon className="h-4 w-4" />
                      ) : (
                        <Paperclip className="h-4 w-4" />
                      )}
                    </Button>
                  </Tooltip>
                  {speech.supported && (
                    <Tooltip
                      label={
                        speech.listening
                          ? "Stop dictation"
                          : "Dictate with your voice"
                      }
                      side="top"
                    >
                      <Button
                        variant={speech.listening ? "default" : "ghost"}
                        size="icon-sm"
                        aria-label={
                          speech.listening
                            ? "Stop dictation"
                            : "Start dictation"
                        }
                        onClick={() =>
                          speech.listening ? speech.stop() : speech.start()
                        }
                        className={cn(speech.listening && "animate-pulse")}
                      >
                        {speech.listening ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    </Tooltip>
                  )}
                  <div className="relative min-w-0 flex-1">
                    <Textarea
                      ref={textareaRef}
                      value={
                        interim
                          ? `${input}${input ? " " : ""}${interim}`
                          : input
                      }
                      onChange={(e) => {
                        setInput(e.target.value);
                        updateTrigger();
                      }}
                      onPaste={onPaste}
                      onSelect={updateTrigger}
                      onKeyUp={updateTrigger}
                      onClick={updateTrigger}
                      onKeyDown={(e) => {
                        if (trigger && menuRef.current?.handleKeyDown(e))
                          return;
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder={
                        backend === "opencode" && !opencodeHealthy
                          ? "OpenCode unavailable — start it, then reload."
                          : speech.listening
                            ? "Listening… speak now"
                            : mode === "agentic"
                              ? "Ask about — or change — anything in your workspace…"
                              : "Message the model directly…"
                      }
                      rows={1}
                      className="max-h-40 min-h-[38px] w-full resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
                    />
                    {trigger && (
                      <MentionMenu
                        ref={menuRef}
                        kind={trigger.kind}
                        query={trigger.query}
                        projectId={projectId}
                        anchor={anchor}
                        onSelect={onMentionSelect}
                        onClose={() => {
                          setTrigger(null);
                          setAnchor(null);
                        }}
                      />
                    )}
                  </div>
                  {stream ? (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Stop"
                      onClick={stop}
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      aria-label="Send"
                      onClick={() => void send()}
                      disabled={sendDisabled}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Type{" "}
                  <kbd className="rounded border border-border bg-muted px-1">
                    /
                  </kbd>{" "}
                  commands ·{" "}
                  <kbd className="rounded border border-border bg-muted px-1">
                    @
                  </kbd>{" "}
                  pages ·{" "}
                  <kbd className="rounded border border-border bg-muted px-1">
                    #
                  </kbd>{" "}
                  records
                </p>
                {speech.error && (
                  <p className="mt-1 text-xs text-destructive">
                    {speech.error}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {linkDialog && projectId && (
        <LinkedProjectsDialog
          projectId={projectId}
          roots={linkedRoots ?? []}
          onClose={() => setLinkDialog(false)}
        />
      )}
      {connDialog && (
        <ConnectionsDialog
          catalog={catalog ?? {}}
          onClose={() => setConnDialog(false)}
        />
      )}
      {pendingQuestion && (
        <QuestionDialog
          requestId={pendingQuestion.questionId}
          questions={pendingQuestion.questions}
          error={questionError}
          onError={setQuestionError}
          onAnswered={() => setPendingQuestion(null)}
          onDismiss={() => {
            setPendingQuestion(null);
            void rejectQuestion(pendingQuestion.questionId).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

/* ── Approval card for OpenCode permission requests ───────────────────── */

function ApprovalCard({
  type,
  title,
  pattern,
  allowRemember = true,
  onSettle,
}: {
  type: string;
  title: string;
  pattern?: string;
  /** Hide the "Always allow" shortcut (no session memory, e.g. in-browser tools). */
  allowRemember?: boolean;
  onSettle: (allowed: boolean, remember: boolean) => void;
}) {
  const isShell = type === "bash" || type === "shell_run";
  const isEdit = type === "edit" || type === "fs_write";
  const detail = pattern || title;
  const headline = isShell
    ? "Run this command?"
    : isEdit
      ? "Edit this file?"
      : `Allow "${type}"?`;

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-warning/50 bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium">{headline}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            Permission request
          </div>
        </div>
      </div>
      <div className="px-3 py-2">
        <div
          className={cn(
            "flex items-start gap-1.5 rounded bg-muted px-2.5 py-1.5 font-mono text-xs",
            isShell && "items-center",
          )}
        >
          {isShell && (
            <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="break-all">{detail}</span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSettle(false, false)}
        >
          Deny
        </Button>
        {allowRemember && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSettle(true, true)}
          >
            Always allow
            {isShell && detail ? ` "${detail.split(/\s+/)[0]}"` : ""}
          </Button>
        )}
        <Button size="sm" onClick={() => onSettle(true, false)}>
          Approve
        </Button>
      </div>
    </div>
  );
}

/* ── Question dialog (opencode `question` tool) ───────────────────────── */

/**
 * Popup window shown when the AI uses its `question` tool: renders each
 * asked question with its options (single / multi select) and an optional
 * custom-answer field, then submits the selected labels to OpenCode so the
 * waiting turn can continue.
 */
function QuestionDialog({
  requestId,
  questions,
  error,
  onError,
  onAnswered,
  onDismiss,
}: {
  requestId: string;
  questions: OpenCodeQuestionInfo[];
  error: string | null;
  onError: (error: string | null) => void;
  onAnswered: () => void;
  onDismiss: () => void;
}) {
  // Per-question selected option labels.
  const [selected, setSelected] = useState<string[][]>(() =>
    questions.map(() => []),
  );
  // Per-question custom-answer text (allowed when custom !== false).
  const [custom, setCustom] = useState<string[]>(() => questions.map(() => ""));
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = questions.every((q, i) => {
    if (selected[i].length > 0) return true;
    if (q.custom !== false && custom[i].trim()) return true;
    return false;
  });

  function toggleOption(qi: number, label: string) {
    setSelected((prev) => {
      const next = prev.map((row) => [...row]);
      const row = next[qi];
      const idx = row.indexOf(label);
      if (questions[qi].multiple) {
        if (idx === -1) row.push(label);
        else row.splice(idx, 1);
      } else {
        next[qi] = idx === -1 ? [label] : [];
      }
      return next;
    });
    onError(null);
  }

  async function submit() {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    onError(null);
    try {
      const answers = questions.map((q, i) => {
        const labels = [...selected[i]];
        if (q.custom !== false && custom[i].trim()) {
          if (!labels.includes(custom[i].trim())) labels.push(custom[i].trim());
        }
        return labels;
      });
      await answerQuestion(requestId, answers);
      onAnswered();
    } catch (e) {
      onError((e as Error).message || "Could not reach the AI agent service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onDismiss();
      }}
      ariaLabel="Question from the AI"
      className="w-[480px] p-0"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4 text-primary" />
          The AI has a question
        </DialogTitle>
        <DialogDescription>
          Answer to continue — the agent is waiting on your reply.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {questions.map((q, qi) => (
          <div key={qi} className="space-y-2">
            <div>
              {q.header && (
                <span className="mb-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                  {q.header}
                </span>
              )}
              <p className="text-sm font-medium">{q.question}</p>
            </div>
            {q.options.length > 0 && (
              <div
                className={cn(
                  "flex flex-wrap gap-1.5",
                  q.multiple && "flex-col items-stretch",
                )}
              >
                {q.options.map((opt) => {
                  const active = selected[qi].includes(opt.label);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => toggleOption(qi, opt.label)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        q.multiple && "flex items-start gap-2",
                      )}
                    >
                      {q.multiple && (
                        <span
                          className={cn(
                            "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                            active
                              ? "border-primary bg-primary"
                              : "border-border",
                          )}
                        >
                          {active && (
                            <Check className="h-2.5 w-2.5 text-primary-foreground" />
                          )}
                        </span>
                      )}
                      <span>
                        <span className="block font-medium">{opt.label}</span>
                        {opt.description && (
                          <span className="block font-normal text-muted-foreground">
                            {opt.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {q.custom !== false && (
              <Input
                value={custom[qi]}
                onChange={(e) => {
                  setCustom((prev) =>
                    prev.map((v, i) => (i === qi ? e.target.value : v)),
                  );
                  onError(null);
                }}
                placeholder={
                  selected[qi].length === 0
                    ? "Type a custom answer…"
                    : "Add a custom answer…"
                }
                className="h-9 text-sm"
              />
            )}
          </div>
        ))}
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          disabled={submitting}
        >
          Dismiss
        </Button>
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={!allAnswered || submitting}
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Answer
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/* ── Thread row with inline rename ────────────────────────────────────── */

function ThreadRow({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: ChatThread;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);

  async function commit() {
    setEditing(false);
    const next = title.trim();
    if (next && next !== thread.title) {
      await chatThreadsRepo.update(thread.id, { title: next });
    } else {
      setTitle(thread.title);
    }
  }

  if (editing) {
    return (
      <div className="mb-0.5 px-1">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") {
              setTitle(thread.title);
              setEditing(false);
            }
          }}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="flex-1 truncate">{thread.title}</span>
      </button>
      <button
        type="button"
        aria-label="Rename chat"
        onClick={() => setEditing(true)}
        className="shrink-0 opacity-0 hover:text-foreground group-hover:opacity-60"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label="Delete chat"
        onClick={onDelete}
        className="shrink-0 opacity-0 hover:text-destructive group-hover:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ── Mode toggle ──────────────────────────────────────────────────────── */

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "agentic" | "chat";
  onChange: (mode: "agentic" | "chat") => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
      {(
        [
          {
            value: "agentic",
            label: "Agentic",
            hint: "Grounded in your workspace; can create and update entities via tools.",
          },
          {
            value: "chat",
            label: "Chat",
            hint: "Direct conversation with the model — nothing from the workspace is sent.",
          },
        ] as const
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.hint}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            mode === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Backend switch (OpenCode / API / Local Ollama) ───────────────────── */

const BACKEND_OPTIONS: {
  value: ChatBackend;
  label: string;
  hint: string;
}[] = [
  {
    value: "opencode",
    label: "OpenCode",
    hint: "Runs on the OpenCode server — full fs/shell/bash tools with per-action approvals.",
  },
  {
    value: "api",
    label: "API",
    hint: "A saved AI connection (key lives in your browser) — workspace + linked-folder tools.",
  },
  {
    value: "ollama",
    label: "Ollama",
    hint: "Local (Ollama) — your own server, no API key needed.",
  },
];

function BackendSwitch({
  backend,
  onChange,
}: {
  backend: ChatBackend;
  onChange: (backend: ChatBackend) => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
      {BACKEND_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.hint}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            backend === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Saved-connection picker (API backend) ────────────────────────────── */

function ConnectionMenu({
  connections,
  value,
  onChange,
  onManage,
}: {
  connections: AiConnection[];
  value: string;
  onChange: (connectionId: string) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = connections.find((c) => c.id === value);
  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-32 truncate">
          {current?.label ?? "Connection"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <ul className="p-1">
            {connections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                    c.id === value && "bg-accent/60",
                  )}
                >
                  <span className="min-w-0 truncate">{c.label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {c.apiKey ? "key" : "no key"}
                  </span>
                </button>
              </li>
            ))}
            {connections.length === 0 && (
              <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                No connections yet.
              </li>
            )}
          </ul>
          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Manage connections…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Catalog model picker (API / Ollama backends) ─────────────────────── */

function CatalogModelMenu({
  models,
  value,
  offline = false,
  onChange,
}: {
  models: AiModel[];
  value: string;
  offline?: boolean;
  onChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [models, query]);
  const current = models.find((m) => m.id === value);

  if (offline) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Ollama isn't reachable — start it and reload the page."
      >
        <span className="max-w-44 truncate">Ollama offline</span>
      </Button>
    );
  }

  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <span className="max-w-44 truncate">{current?.name ?? "Model"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-80 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="relative border-b border-border p-1.5">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <ScrollArea className="max-h-64">
            <ul className="p-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                      m.id === value && "bg-accent/60",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {m.tool_call && (
                        <span title="Supports tools — full agentic mode">
                          <Wrench className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {m.attachment && (
                        <span title="Accepts images">
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {m.reasoning && (
                        <span title="Supports extended thinking">
                          <BrainCircuit className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  No models found.
                </li>
              )}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

/* ── Empty-thread suggestions ─────────────────────────────────────────── */

function Suggestions({
  mode,
  onPick,
}: {
  mode: "agentic" | "chat";
  onPick: (text: string) => void;
}) {
  const list = mode === "agentic" ? AGENTIC_SUGGESTIONS : CHAT_SUGGESTIONS;
  return (
    <div className="py-8">
      <p className="mb-3 text-center text-sm text-muted-foreground">
        {mode === "agentic"
          ? "The assistant sees your whole workspace and can act on it. Try:"
          : "Direct chat with the model. Try:"}
      </p>
      <div className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">
        {list.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── One message row ──────────────────────────────────────────────────── */

/**
 * One message row. Memoized so a streaming turn only re-renders the row
 * whose `live` stream is changing — other messages (and their markdown
 * re-parsing) stay untouched on every chunk. The callbacks are stable in
 * behavior, so the comparator ignores their per-render identities.
 */
const MessageRow = memo(
  function MessageRow({
    message: m,
    live,
    showTimestamps,
    busy,
    onCopy,
    onDelete,
    onRegenerate,
    onSaveCodeAsNote,
    onUndoFiles,
  }: {
    message: ChatMessage;
    live: LiveStream | null;
    showTimestamps: boolean;
    busy: boolean;
    onCopy: () => void;
    onDelete: () => void;
    onRegenerate: () => void;
    onSaveCodeAsNote: (code: string, language: string) => void;
    onUndoFiles?: () => void;
  }) {
    const [copied, setCopied] = useState(false);
    const content = live ? live.text : m.content;
    const reasoning = live ? live.reasoning : (m.reasoning ?? "");
    const toolActivity = live ? live.tools : (m.toolActivity ?? []);
    const notices = live ? live.notices : (m.notices ?? []);
    const files = live ? live.files : (m.files ?? []);
    const attachments = m.attachments ?? [];
    const isUser = m.role === "user";
    // Streaming deltas arrive faster than react-markdown can re-parse the
    // whole message. useDeferredValue keeps the UI responsive on long
    // responses: the raw text stays current while the expensive markdown
    // render is deferred and can be interrupted by React.
    const renderedContent = useDeferredValue(content);

    return (
      <div className={cn("group flex gap-3", isUser && "flex-row-reverse")}>
        {!isUser && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Bot className="h-4 w-4" />
          </span>
        )}
        <div
          className={cn("min-w-0 pt-0.5", isUser ? "max-w-[85%]" : "flex-1")}
        >
          {showTimestamps && (
            <div
              className={cn(
                "mb-0.5 text-[10px] text-muted-foreground",
                isUser && "text-right",
              )}
            >
              {new Date(m.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}

          {attachments.length > 0 && (
            <div
              className={cn(
                "mb-1.5 flex flex-wrap gap-2",
                isUser && "justify-end",
              )}
            >
              {attachments.map((a, i) => (
                <AttachmentChip key={`${a.name}-${i}`} attachment={a} />
              ))}
            </div>
          )}

          {notices.map((n, i) => (
            <p
              key={i}
              className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <Info className="h-3 w-3 shrink-0" /> {n}
            </p>
          ))}

          {toolActivity.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {toolActivity.map((t, i) => (
                <span
                  key={`${t.name}-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border border-border bg-accent/40 px-2 py-0.5 text-[11px]",
                    t.ok ? "text-muted-foreground" : "text-destructive",
                  )}
                  title={t.summary}
                >
                  <Wrench className="h-3 w-3" />
                  {prettyToolName(t.name)}
                  {t.summary && (
                    <span className="max-w-36 truncate opacity-70">
                      {t.summary}
                    </span>
                  )}
                  {t.running ? (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  ) : t.ok ? (
                    <Check className="h-3 w-3 text-node-lore" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </span>
              ))}
            </div>
          )}

          {(files.length > 0 || onUndoFiles) && (
            <div className="mb-1.5 flex flex-wrap items-center gap-1">
              {files.map((f, i) => (
                <span
                  key={`${f}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-accent/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  title={`Edited file: ${f}`}
                >
                  <FileText className="h-3 w-3 text-node-lore" />
                  <span className="max-w-52 truncate">{f}</span>
                </span>
              ))}
              {!live && onUndoFiles && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Undo this reply's file changes"
                  title="Revert the file changes this reply made"
                  disabled={busy}
                  onClick={onUndoFiles}
                  className="h-5 w-5"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}

          {!live && <UndoChips messageId={m.id} busy={busy} />}

          {reasoning && (
            <ThinkingBlock
              text={reasoning}
              streaming={Boolean(live) && !content}
            />
          )}

          {isUser ? (
            <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
              {content}
            </div>
          ) : (
            // Assistant replies render as markdown both persisted and live —
            // partial markdown while streaming degrades gracefully.
            <>
              {(content || live) && (
                <div className="text-sm">
                  <MarkdownPreview
                    content={renderedContent}
                    onSaveCodeAsNote={onSaveCodeAsNote}
                  />
                  {live && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom" />
                  )}
                </div>
              )}
              {/* A message left mid-stream by a dead session (refresh, crash,
                thread switch) renders as interrupted instead of a silent
                blank bubble — legacy records with no status and no content
                are the same case. */}
              {!live &&
                m.role === "assistant" &&
                (m.status === "streaming" ||
                  (m.status === undefined &&
                    !m.content.trim() &&
                    !m.error)) && (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    The response was interrupted before it finished.
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRegenerate}
                      disabled={busy}
                    >
                      <RotateCw className="h-3 w-3" /> Retry
                    </Button>
                  </div>
                )}
              {m.error && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {m.error}
                  {m.error !== "Stopped." && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onRegenerate}
                      disabled={busy}
                    >
                      <RotateCw className="h-3 w-3" /> Retry
                    </Button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Hover actions */}
          {!live && (m.content || m.error) && (
            <div
              className={cn(
                "mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100",
                isUser && "justify-end",
              )}
            >
              {m.content && (
                <Tooltip label={copied ? "Copied!" : "Copy"} side="bottom">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy message"
                    onClick={() => {
                      onCopy();
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    }}
                    className="h-6 w-6 text-muted-foreground"
                  >
                    {copied ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </Tooltip>
              )}
              {m.role === "assistant" && (
                <Tooltip label="Regenerate" side="bottom">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Regenerate reply"
                    onClick={onRegenerate}
                    disabled={busy}
                    className="h-6 w-6 text-muted-foreground"
                  >
                    <RotateCw className="h-3 w-3" />
                  </Button>
                </Tooltip>
              )}
              <Tooltip label="Delete" side="bottom">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete message"
                  onClick={onDelete}
                  disabled={busy}
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.message === next.message &&
    prev.live === next.live &&
    prev.showTimestamps === next.showTimestamps &&
    prev.busy === next.busy,
);

/**
 * Revert chips for AI-made workspace changes. Lists every recorded undo entry
 * belonging to the assistant message and offers one-click rollback (restore,
 * delete, or re-add the entity) plus an expandable before/after diff. The
 * ledger row is consumed on revert, so the live query clears the chip
 * automatically.
 */
function UndoChips({ messageId, busy }: { messageId: string; busy: boolean }) {
  const [reverted, setReverted] = useState<string | null>(null);
  const [openDiff, setOpenDiff] = useState<string | null>(null);
  const entries = useLiveQuery(
    () => aiUndoRepo.listByMessage(messageId),
    [messageId],
  );

  if (!entries || entries.length === 0) return null;

  async function revert(entryId: string) {
    const list = entries;
    if (!list) return;
    const entry = list.find((e) => e.id === entryId);
    if (!entry) return;
    try {
      const label = await aiUndoRepo.revert(entry);
      setReverted(`${entry.toolName}: ${label}`);
      setTimeout(() => setReverted(null), 2500);
    } catch {
      setReverted("Revert failed — the entity may have changed since.");
      setTimeout(() => setReverted(null), 3500);
    }
  }

  return (
    <div className="mb-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {entries.map((e) => (
          <span
            key={e.id}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-muted-foreground"
            title={`AI ${e.action} via ${e.toolName}`}
          >
            <Undo2 className="h-3 w-3 text-primary" />
            <span className="max-w-40 truncate">{aiUndoRepo.describe(e)}</span>
            {e.before !== null && e.after !== null && (
              <button
                type="button"
                aria-label="Show diff"
                onClick={() => setOpenDiff(openDiff === e.id ? null : e.id)}
                className="rounded px-1 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Diff
              </button>
            )}
            <button
              type="button"
              aria-label="Undo this AI change"
              disabled={busy}
              onClick={() => void revert(e.id)}
              className="rounded px-1 font-medium text-primary hover:bg-primary/15 hover:text-primary"
            >
              Undo
            </button>
          </span>
        ))}
        {reverted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3 text-node-lore" /> {reverted}
          </span>
        )}
      </div>
      {openDiff && (
        <DiffPreview entry={entries.find((e) => e.id === openDiff) ?? null} />
      )}
    </div>
  );
}

/** Compact before/after diff of the entity fields an AI change touched. */
function DiffPreview({ entry }: { entry: AiUndo | null }) {
  if (!entry) return null;
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  )
    .filter((k) => !["id", "projectId", "createdAt", "updatedAt"].includes(k))
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));

  if (keys.length === 0) return null;

  const fmt = (v: unknown): string => {
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
  };

  return (
    <div className="mt-1 max-h-64 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <GitCompareArrows className="h-3 w-3" />
        Changed by {entry.toolName} — click Undo above to roll back
      </div>
      {keys.map((k) => (
        <div key={k} className="mb-2 last:mb-0">
          <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">
            {k}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="overflow-hidden rounded bg-card/70">
              <div className="px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground opacity-70">
                Before
              </div>
              <pre className="max-h-24 overflow-auto px-1.5 pb-1.5 text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {fmt(before[k]).slice(0, 2000)}
              </pre>
            </div>
            <div className="overflow-hidden rounded border border-node-lore/30 bg-card/70">
              <div className="px-1.5 py-0.5 text-[9px] font-medium text-node-lore opacity-80">
                After
              </div>
              <pre className="max-h-24 overflow-auto px-1.5 pb-1.5 text-[10px] leading-relaxed whitespace-pre-wrap">
                {fmt(after[k]).slice(0, 2000)}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AttachmentChip({ attachment: a }: { attachment: ChatAttachment }) {
  if (a.kind === "image" && a.dataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={a.dataUrl}
        alt={a.name}
        title={a.name}
        className="h-24 max-w-48 rounded-md border border-border object-cover"
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1 text-xs">
      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="max-w-40 truncate">{a.name}</span>
    </span>
  );
}

/** Collapsible extended-thinking block. */
function ThinkingBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const show = open || streaming;
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {show ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <BrainCircuit className="h-3 w-3" />
        Thinking{streaming ? "…" : ""}
      </button>
      {show && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}

/* ── OpenCode provider / model pickers ────────────────────────────────── */

function OpenCodeProviderMenu({
  providers,
  value,
  onChange,
}: {
  providers: { providerId: string; providerName: string }[];
  value: string;
  onChange: (providerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = providers.find((p) => p.providerId === value);
  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-32 truncate">
          {current?.providerName ?? "Provider"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <ul className="p-1">
            {providers.map((p) => (
              <li key={p.providerId}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p.providerId);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full truncate rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                    p.providerId === value && "bg-accent/60",
                  )}
                >
                  {p.providerName}
                </button>
              </li>
            ))}
            {providers.length === 0 && (
              <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                No providers connected.
              </li>
            )}
          </ul>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            Providers are configured in OpenCode — run{" "}
            <code className="rounded bg-muted px-1">opencode auth</code>.
          </p>
        </div>
      )}
    </div>
  );
}

function OpenCodeModelMenu({
  models,
  value,
  onChange,
}: {
  models: {
    id: string;
    name: string;
    capabilities: {
      reasoning: boolean;
      attachment: boolean;
      toolcall: boolean;
    };
  }[];
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
    );
  }, [models, query]);
  const current = models.find((m) => m.id === value);

  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <span className="max-w-44 truncate">{current?.name ?? "Model"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-80 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="relative border-b border-border p-1.5">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <ScrollArea className="max-h-64">
            <ul className="p-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                      m.id === value && "bg-accent/60",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {m.capabilities.toolcall && (
                        <span title="Supports tools — full agentic mode">
                          <Wrench className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {m.capabilities.attachment && (
                        <span title="Accepts images">
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {m.capabilities.reasoning && (
                        <span title="Supports extended thinking">
                          <BrainCircuit className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  No models found.
                </li>
              )}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
