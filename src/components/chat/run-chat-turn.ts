import { buildLegacyMessages } from "@/lib/ai/chat-backends";
import { chatThreadsRepo, chatMessagesRepo } from "@/lib/db/repos";
import type {
  ChatMessage,
  ChatThread,
  ChatAttachment,
  ToolActivity,
  AiConnection,
} from "@/lib/db/schema";
import { buildAgentSystemPrompt } from "@/lib/ai/agent";
import { newRequestId } from "@/lib/ai/agent/logger";
import {
  defaultModelId,
  modelSupportsReasoning,
  modelSupportsTools,
  type Catalog,
  type AiProvider,
} from "@/lib/ai/catalog";
import type { ApprovalRequest } from "@/lib/ai/fs-tools";
import { runAgentTurn, type TurnEvent } from "@/lib/ai/turn/run-agent-turn";
import { ChatAbortError, type WireMessage } from "@/lib/ai/chat-client";
import {
  attachmentsToWire,
  providerForConnection,
} from "@/lib/ai/chat-backends";
import {
  runWithFallback,
  type FallbackTarget,
} from "@/lib/ai/providers/fallback";
import { effortToReasoning, type Effort } from "@/lib/ai/providers/effort";
import { fallbackNoticeText } from "@/lib/ai/providers/fallback-notice";
import { createEchoStripper } from "@/lib/chat/echo-strip";
import type { LiveStream } from "@/lib/chat/live-stream";
import { clipToolResult, summarizeToolArgs } from "@/lib/chat/live-stream";
import type { LinkedProject } from "@/lib/db/schema";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

/** A pending in-browser fs/shell approval the agent is suspended on. */
export interface LegacyApproval {
  request: ApprovalRequest;
  resolve: (allowed: boolean) => void;
}

/** Everything one assistant turn needs from the surrounding chat view. */
export interface TurnContext {
  thread: ChatThread | null;
  catalog: Catalog | null;
  connections: AiConnection[];
  linkedRoots: LinkedProject[] | undefined;
  /** The history sent to the model (a side chat includes the shared main context). */
  messages: ChatMessage[];
  projectId: string | null;
  busyRef: MutableRefObject<boolean>;
  userCancelledRef: MutableRefObject<boolean>;
  turnGenRef: MutableRefObject<number>;
  activeAssistantRef: MutableRefObject<string | null>;
  abortRef: MutableRefObject<AbortController | null>;
  setStream: Dispatch<SetStateAction<LiveStream | null>>;
  setSendError: (message: string | null) => void;
  setLegacyApproval: Dispatch<SetStateAction<LegacyApproval | null>>;
}

/**
 * Run one assistant turn through the in-browser Agent Loop (API connection
 * or local Ollama): history is rebuilt from the stored messages, the
 * workspace tools + linked-folder fs/shell tools execute in the browser
 * with per-action approval, and everything streams through the shared
 * streaming event shapes.
 */
export async function runChatTurn(
  ctx: TurnContext,
  userText: string,
  attachments: ChatAttachment[],
  opts: { replaceId?: string } = {},
) {
  const {
    thread,
    catalog,
    connections,
    linkedRoots,
    messages,
    projectId,
    busyRef,
    userCancelledRef,
    turnGenRef,
    activeAssistantRef,
    abortRef,
    setStream,
    setSendError,
    setLegacyApproval,
  } = ctx;
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

  // Strip a leading echo of the user's message from the reply (see
  // createEchoStripper) — the turn loop strips it with the same helper.
  const echoStripper = createEchoStripper(userText);

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
  const cat = catalog;
  // Pre-T8 rows have no `effort` — derive it from the legacy flag so old
  // threads keep their behaviour (medium ≈ the old 8k thinking budget).
  const effort: Effort = t.effort ?? (t.reasoningEnabled ? "medium" : "off");
  const requestId = newRequestId();

  /**
   * The ordered places this turn can go: the thread's own connection, then
   * its fallback chain. Ollama threads have a single local target.
   */
  const chain: FallbackTarget[] =
    t.backend === "ollama"
      ? [{ connectionId: "", modelId: t.modelId }]
      : [
          { connectionId: t.connectionId, modelId: t.modelId },
          ...(t.fallbacks ?? []),
        ];
  const primary = chain[0];

  /** The provider + credentials behind one fallback target. */
  const targetContext = (
    target: FallbackTarget,
  ): {
    provider: AiProvider;
    apiKey: string;
    baseUrl: string | undefined;
  } => {
    if (t.backend === "ollama") {
      const provider = cat.ollama ?? null;
      if (!provider || Object.keys(provider.models).length === 0) {
        throw new Error(
          "Ollama isn't reachable — start it (`ollama serve`) and retry.",
        );
      }
      return { provider, apiKey: "", baseUrl: undefined };
    }
    const conn = connections.find((c) => c.id === target.connectionId);
    if (!conn) {
      throw new Error(
        target === primary
          ? "No AI connection is selected — pick one from the header and retry."
          : `The fallback connection "${target.connectionId}" was not found — skipped.`,
      );
    }
    const provider = providerForConnection(cat, conn);
    if (!provider) {
      throw new Error(
        target === primary
          ? "The connection's provider isn't in the catalog — pick another connection."
          : `The connection "${conn.label}" has no catalog provider — not found.`,
      );
    }
    return {
      provider,
      apiKey: conn.apiKey,
      baseUrl: conn.baseUrl.trim() || undefined,
    };
  };

  try {
    // Both backends run the in-browser Agent Loop. A connection that can
    // never work (bad key, no credit, unknown model) falls through to the
    // thread's ordered fallbacks; a rate-limited one gets one retry first.
    // The attempt resets the accumulators so a failed attempt never leaks
    // partial text into the next one, and the thread is only repointed
    // when the user confirms a switch ("Keep using this model").
    await runWithFallback(
      chain,
      async (target) => {
        acc = "";
        reasoningAcc = "";
        echoStripper.reset();

        const ctx = targetContext(target);
        const modelId = target.modelId || defaultModelId(ctx.provider);

        const withTools = agentic && modelSupportsTools(ctx.provider, modelId);
        if (agentic && !withTools) {
          const n =
            "The selected model can't call tools — this turn is chat-only. Pick a tool-capable model to use agentic mode.";
          if (!notices.includes(n)) notices.push(n);
        }
        push();

        // Agentic turns are grounded in the live workspace briefing; the
        // tool guidance matches what the browser Agent Loop can execute.
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
          const n =
            "Workspace briefing trimmed to fit the model context window.";
          if (!notices.includes(n)) notices.push(n);
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

        const result = await runAgentTurn({
          surface: "chat",
          projectId: projectId!,
          threadId: t.id,
          undoOwnerId: assistant.id,
          requestId,
          provider: ctx.provider,
          apiKey: ctx.apiKey,
          baseUrl: ctx.baseUrl,
          model: modelId,
          system: context?.system ?? undefined,
          messages: wireMessages,
          toolset: withTools ? "workspace" : "none",
          linkedRoots: linkedRoots ?? [],
          requestApproval: (request) =>
            new Promise<boolean>((resolve) => {
              if (controller.signal.aborted) {
                resolve(false);
                return;
              }
              setLegacyApproval({ request, resolve });
            }),
          reasoning: effortToReasoning(
            effort,
            modelSupportsReasoning(ctx.provider, modelId),
          ),
          signal: controller.signal,
          onEvent: (e: TurnEvent) => {
            if (gen !== turnGenRef.current) return;
            switch (e.type) {
              case "text":
                acc += echoStripper.strip(e.text);
                break;
              case "reasoning":
                reasoningAcc += e.text;
                break;
              case "round":
                // A later round starts fresh content: release any text the
                // echo stripper was still holding from the previous one.
                // (Round 0 opens the turn, before any text arrives.)
                if (e.round > 0) acc += echoStripper.flush();
                if (e.round > 0 && acc) acc += "\n\n";
                break;
              case "notice":
                notices.push(e.message);
                break;
              case "tool_call":
                toolIndexById.set(e.id, tools.length);
                tools.push({
                  name: e.name,
                  id: e.id,
                  arguments: e.arguments,
                  summary: summarizeToolArgs(e.arguments),
                  ok: true,
                  running: true,
                });
                break;
              case "tool_result": {
                const i = toolIndexById.get(e.id);
                if (i !== undefined)
                  tools[i] = {
                    ...tools[i],
                    ok: e.ok,
                    running: false,
                    result: clipToolResult(e.content),
                  };
                break;
              }
              case "error":
                lastError = e.message;
                break;
            }
            push();
          },
        });
        // The stream ended: a reply that was still matching the echo (e.g.
        // "Yes" to "yes, go ahead") is real content, not an echo.
        acc += echoStripper.flush();
        push();
        return result;
      },
      {
        onSwitch: (_from, to, reason) => {
          // Discard the failed attempt's partial output; the notice carries
          // a "Keep using this model" action — only that click repoints.
          acc = "";
          reasoningAcc = "";
          echoStripper.reset();
          const label = to.connectionId
            ? (connections.find((c) => c.id === to.connectionId)?.label ??
              "another connection")
            : "Local (Ollama)";
          notices.push(fallbackNoticeText(label, to, reason));
          push();
        },
      },
    );

    if (gen !== turnGenRef.current) return;
    const userCancelled = userCancelledRef.current || controller.signal.aborted;
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
    const userCancelled = userCancelledRef.current || controller.signal.aborted;
    const message =
      userCancelled || e instanceof ChatAbortError
        ? "Stopped."
        : (e as Error).message || "The AI request failed — Retry to continue.";
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
