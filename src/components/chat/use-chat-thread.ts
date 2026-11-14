import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  chatThreadsRepo,
  chatMessagesRepo,
  linkedProjectsRepo,
  aiConnectionsRepo,
} from "@/lib/db/repos";
import type {
  ChatMessage,
  ChatThread,
  ChatBackend,
  AiConnection,
} from "@/lib/db/schema";
import {
  fetchCatalog,
  defaultModelId,
  modelSupportsImages,
  modelSupportsReasoning,
  type Catalog,
} from "@/lib/ai/catalog";
import { providerForConnection } from "@/lib/ai/chat-backends";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { pageUrl } from "@/lib/navigation/surfaces";
import {
  inheritedMessages,
  sideLinkFor,
  sideThreadTitle,
  turnContextMessages,
} from "@/lib/chat/side-thread";

/**
 * Thread-level state for the chat surface: the active thread (from the
 * `?thread=` address), its live data, backend / connection resolution, and
 * thread-level actions (new chat, switch backend, delete, side chats).
 */
export function useChatThread({
  setThreadsOpen,
  setConnDialog,
  setSendError,
}: {
  setThreadsOpen: (open: boolean) => void;
  setConnDialog: (open: boolean) => void;
  setSendError: (message: string | null) => void;
}) {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("thread");
  const { defaultBackend, fallbacks: chatFallbacks } = usePageSettings(
    (s) => s.chat,
  );

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [threadQuery, setThreadQuery] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const c = await fetchCatalog();
        setCatalog(c);
      } catch {
        // The fallback catalog never throws; this keeps TS honest.
      }
    })();
  }, []);

  const threadsRaw = useLiveQuery(
    () => chatThreadsRepo.listByProject(projectId),
    [projectId],
  );
  const allThreads = useMemo(() => threadsRaw ?? [], [threadsRaw]);
  // Side chats are reached from the message they branch at, not the list.
  const threads = useMemo(
    () => allThreads.filter((t) => !t.sideOf),
    [allThreads],
  );
  const messagesRaw = useLiveQuery(
    () => chatMessagesRepo.listByThread(threadId),
    [threadId],
  );
  const messages = useMemo(() => messagesRaw ?? [], [messagesRaw]);
  const linkedRoots = useLiveQuery(
    () =>
      projectId
        ? linkedProjectsRepo.listByProject(projectId)
        : Promise.resolve([]),
    [projectId],
  );
  const connections = useLiveQuery(() => aiConnectionsRepo.list(), []) ?? [];

  const thread = allThreads.find((t) => t.id === threadId) ?? null;

  const mode = thread?.mode ?? "agentic";
  const backend: ChatBackend = thread?.backend === "ollama" ? "ollama" : "api";
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
  // Does the thread's current model advertise reasoning support? (Drives the
  // effort selector's hint; the level itself is inert without it.)
  const activeCanReason =
    backend === "api" && apiProvider && thread
      ? modelSupportsReasoning(apiProvider, thread.modelId)
      : backend === "ollama" && ollamaProvider && thread
        ? modelSupportsReasoning(ollamaProvider, thread.modelId)
        : false;
  const canUseImages =
    backend === "api" && apiProvider && thread
      ? modelSupportsImages(apiProvider, thread.modelId)
      : backend === "ollama" && ollamaProvider && thread
        ? modelSupportsImages(ollamaProvider, thread.modelId)
        : false;

  const visibleThreads = useMemo(() => {
    const q = threadQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, threadQuery]);

  function select(id: string | null) {
    setThreadsOpen(false);
    router.replace(pageUrl("/chat", id ? `thread=${id}` : ""), {
      scroll: false,
    });
  }

  async function newChat() {
    if (!projectId) return;
    // Coerce legacy persisted backend values to the API backend.
    const backendForNew: ChatBackend =
      defaultBackend === "ollama" ? "ollama" : "api";
    let firstModel = "";
    let providerId = "";
    let connectionId = "";

    if (backendForNew === "api") {
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
      // Seed the new thread's fallback chain from the user's default list
      // (API backend only — Ollama is a single local target).
      fallbacks: backendForNew === "api" ? (chatFallbacks ?? []) : [],
    });
    select(t.id);
  }

  /**
   * Switch a thread between the API and Ollama backends. Keeps the
   * conversation (messages persist in the DB) and fills sensible defaults
   * for the target backend.
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
    } else {
      patch.connectionId = "";
      patch.providerId = "ollama";
      patch.modelId = ollamaProvider ? defaultModelId(ollamaProvider) : "";
    }
    await chatThreadsRepo.update(thread.id, patch);
  }

  async function deleteThread(id: string) {
    // A main thread takes its side chats with it; they have no other home.
    for (const t of allThreads) {
      if (t.sideOf?.threadId === id) await chatThreadsRepo.remove(t.id);
    }
    const mainId = allThreads.find((t) => t.id === id)?.sideOf?.threadId;
    await chatThreadsRepo.remove(id);
    if (id === threadId) select(mainId ?? null);
  }

  /* ── Side chats ───────────────────────────────────────────────────── */

  const isSide = Boolean(thread?.sideOf);

  // The main thread a side chat branched from (read-only context here).
  const mainThreadId = thread?.sideOf?.threadId ?? null;
  const mainThread = allThreads.find((t) => t.id === mainThreadId) ?? null;
  const mainMessagesRaw = useLiveQuery(
    () => chatMessagesRepo.listByThread(mainThreadId),
    [mainThreadId],
  );
  const mainMessages = useMemo(() => mainMessagesRaw ?? [], [mainMessagesRaw]);
  const contextMessages = useMemo(
    () => turnContextMessages(thread, messages, mainMessages),
    [thread, messages, mainMessages],
  );
  const sharedCount = thread?.sideOf
    ? inheritedMessages(mainMessages, thread.sideOf).length
    : 0;

  // Main thread: which message each existing side chat branched from.
  const sideChatByMessage = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allThreads) {
      if (t.sideOf && t.sideOf.threadId === threadId) {
        map.set(t.sideOf.messageId, t.id);
      }
    }
    return map;
  }, [allThreads, threadId]);

  /** Branch a side chat at `message`, or open the one already there. */
  async function startSideChat(message: ChatMessage) {
    if (!thread || !projectId) return;
    const existing = sideChatByMessage.get(message.id);
    if (existing) {
      select(existing);
      return;
    }
    const link = sideLinkFor(thread, message);
    if (!link) return;
    const side = await chatThreadsRepo.create({
      projectId,
      title: sideThreadTitle(message),
      backend: thread.backend,
      connectionId: thread.connectionId,
      modelId: thread.modelId,
      providerId: thread.providerId,
      mode: thread.mode,
      effort: thread.effort,
      fallbacks: thread.fallbacks ?? [],
      sideOf: link,
    });
    select(side.id);
  }

  /** Leave a side chat and show the main thread it branched from. */
  function returnToMain() {
    select(mainThreadId);
  }

  /** Delete the current side chat and show its main thread. */
  async function discardSideChat() {
    if (!thread?.sideOf) return;
    const mainId = thread.sideOf.threadId;
    await chatThreadsRepo.remove(thread.id);
    select(mainId);
  }

  return {
    projectId,
    threadId,
    catalog,
    threads,
    visibleThreads,
    threadQuery,
    setThreadQuery,
    messages,
    linkedRoots,
    connections,
    thread,
    mode,
    backend,
    apiConnection,
    apiProvider,
    ollamaProvider,
    activeCanReason,
    canUseImages,
    select,
    newChat,
    switchBackend,
    deleteThread,
    isSide,
    mainThread,
    contextMessages,
    sharedCount,
    sideChatByMessage,
    startSideChat,
    returnToMain,
    discardSideChat,
  };
}
