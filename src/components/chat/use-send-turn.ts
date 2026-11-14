import { isDuplicateUserMessage } from "@/lib/chat/live-stream";
import { useEffect, useRef, useState } from "react";
import { chatThreadsRepo, chatMessagesRepo } from "@/lib/db/repos";
import type {
  ChatMessage,
  ChatThread,
  ChatAttachment,
  ChatBackend,
  AiConnection,
} from "@/lib/db/schema";
import {
  defaultModelId,
  modelSupportsTools,
  type Catalog,
  type AiProvider,
} from "@/lib/ai/catalog";
import { type FallbackTarget } from "@/lib/ai/providers/fallback";
import {
  parseModelRef,
  parseSlashModel,
  resolveModelRef,
} from "@/lib/ai/providers/model-ref";
import { resolveRecordMention } from "@/lib/chat/mention-resolve";
import type { LiveStream } from "@/lib/chat/live-stream";
import type { LinkedProject } from "@/lib/db/schema";
import { runChatTurn, type LegacyApproval } from "./run-chat-turn";
import type { ComposerHandle } from "./use-composer";

export interface SendTurnInput {
  thread: ChatThread | null;
  threadId: string | null;
  catalog: Catalog | null;
  connections: AiConnection[];
  linkedRoots: LinkedProject[] | undefined;
  /** The thread's own messages. */
  messages: ChatMessage[];
  /** What the model sees: `messages`, preceded by the shared main context in a side chat. */
  contextMessages: ChatMessage[];
  projectId: string | null;
  backend: ChatBackend;
  mode: "agentic" | "chat";
  apiConnection: AiConnection | null;
  apiProvider: AiProvider | null;
  composer: ComposerHandle;
  setSendError: (message: string | null) => void;
  setModelPickerOpen: (open: boolean) => void;
  setConnDialog: (open: boolean) => void;
}

/**
 * Turn lifecycle: the live stream, the one-turn-at-a-time guard, in-browser
 * approvals, and send / regenerate / stop / keep-model. The turn itself runs
 * in `runChatTurn`.
 */
export function useSendTurn({
  thread,
  threadId,
  catalog,
  connections,
  linkedRoots,
  messages,
  contextMessages,
  projectId,
  backend,
  mode,
  apiConnection,
  apiProvider,
  composer,
  setSendError,
  setModelPickerOpen,
  setConnDialog,
}: SendTurnInput) {
  const {
    input,
    setInput,
    pending,
    setPending,
    mentions,
    setMentions,
    setTrigger,
    setAnchor,
    setAttachError,
  } = composer;
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  /** In-browser fs/shell approval (API/Ollama backends): resolve the promise. */
  const [legacyApproval, setLegacyApproval] = useState<LegacyApproval | null>(
    null,
  );
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

  /* ── In-browser fs/shell approval (API / Ollama backends) ────────────── */

  /**
   * Reject any in-flight approval (Stop / thread switch / unmount). Without
   * this the agent would sit suspended forever on a request nothing answers —
   * the "stuck after a tool call" failure.
   */
  function rejectPendingApproval() {
    setLegacyApproval((p) => {
      if (p) p.resolve(false);
      return null;
    });
  }

  /** Run one assistant turn through the in-browser Agent Loop. */
  async function runTurn(
    userText: string,
    attachments: ChatAttachment[],
    opts: { replaceId?: string } = {},
  ) {
    return runChatTurn(
      {
        thread,
        catalog,
        connections,
        linkedRoots,
        messages: contextMessages,
        projectId,
        busyRef,
        userCancelledRef,
        turnGenRef,
        activeAssistantRef,
        abortRef,
        setStream,
        setSendError,
        setLegacyApproval,
      },
      userText,
      attachments,
      opts,
    );
  }

  async function send() {
    if (!thread || busyRef.current || stream) return;
    const text = input.trim();
    if (!text && pending.length === 0) return;

    // `/model …` never reaches the network: bare opens the unified model
    // picker; `provider-or-label:model` repoints this chat at a saved
    // connection. The command itself is consumed locally either way.
    const slash = parseSlashModel(input);
    if (slash) {
      if (!slash.ref) {
        setModelPickerOpen(true);
        setSendError(null);
        return;
      }
      const hit = resolveModelRef(slash.ref, connections);
      if (hit) {
        const conn = connections.find((c) => c.id === hit.connectionId);
        await chatThreadsRepo.update(thread.id, {
          connectionId: hit.connectionId,
          modelId: hit.modelId,
          providerId: conn?.providerId ?? thread.providerId,
          // A switch only makes sense on the API backend.
          backend: "api",
        });
        setInput("");
        setSendError(null);
        setInlineNotice(
          `Now using ${conn?.label ?? hit.connectionId}:${hit.modelId}`,
        );
      } else {
        setSendError(
          `No saved connection matches "${parseModelRef(slash.ref).providerId}". Add one in Connections.`,
        );
      }
      return;
    }

    if (backend === "api") {
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

  /**
   * Accept a fallback switch: repoint the thread at the target the turn
   * actually succeeded on (persisted only now, on the user's click).
   */
  async function keepModel(threadId: string, target: FallbackTarget) {
    const conn = connections.find((c) => c.id === target.connectionId);
    await chatThreadsRepo.update(threadId, {
      connectionId: target.connectionId,
      modelId: target.modelId,
      providerId: conn?.providerId ?? "",
      backend: "api",
    });
    setInlineNotice(
      `Now using ${conn?.label ?? target.connectionId}:${target.modelId}`,
    );
  }

  function stop() {
    // Only a real user click marks the turn as cancelled — timeouts and
    // connection failures go through the error path, never "Stopped.".
    userCancelledRef.current = true;
    console.info("[chat] turn cancelled by user");
    rejectPendingApproval();
    abortRef.current?.abort();
  }

  return {
    stream,
    inlineNotice,
    legacyApproval,
    setLegacyApproval,
    send,
    regenerate,
    keepModel,
    stop,
  };
}
