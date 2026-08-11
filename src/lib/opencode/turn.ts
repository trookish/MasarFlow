/**
 * Turn controller — one user message → one OpenCode session turn.
 *
 * Lifecycle guarantees:
 *   - every turn ends with exactly one `done` event (completed | failed | cancelled)
 *   - one active turn per session (a second send is rejected, never silently
 *     queued — the frontend surfaces "already responding")
 *   - watchdogs: first-event, idle, and total budgets abort the server-side
 *     turn so nothing hangs forever
 *   - a dropped browser connection does NOT abort the OpenCode turn: it keeps
 *     running server-side and a reconnecting browser can attach (`resume`) to
 *     the live event stream without a duplicate request
 *
 * Events arrive over the shared SSE bus (events.ts); the POST to
 * `/session/{id}/message` is the completion signal and the reconcile source
 * when the SSE bus was interrupted.
 */

import { OpenCodeClient } from "./client";
import type { OpenCodeConfig } from "./config";
import { OpenCodeError, classifyAssistantError, userMessage } from "./errors";
import { eventBus } from "./events";
import { createOpencodeLogger, newOpenCodeRequestId } from "./logger";
import { WORKSPACE_TOOL_NAMES } from "@/lib/ai/workspace-tool-defs";
import {
  buildPromptBody,
  buildPromptParts,
  type ChatAttachmentInput,
} from "./messages";
import { ensureSession } from "./sessions";
import {
  createTranslationState,
  partUpdatedEvents,
  reasoningDeltas,
  sessionEventToFrontend,
  textPartDeltas,
  TOOL_OUTPUT_CAP,
  type TranslationState,
} from "./tools";
import type {
  OpenCodeEvent,
  OpenCodeFrontendEvent,
  OpenCodePart,
  OpenCodeToolPart,
} from "./types";

export interface TurnInput {
  chatId: string;
  /** Stored OpenCode session id (may be empty → created on demand). */
  sessionId?: string;
  /** Linked project root — the session's working directory when present. */
  directory?: string;
  providerId?: string;
  modelId?: string;
  agent?: string;
  system?: string;
  text: string;
  attachments?: ChatAttachmentInput[];
  /** false → chat mode (tools disabled for the message). */
  toolsEnabled: boolean;
  requestId?: string;
  signal?: AbortSignal;
  /** Attach to an already-running turn instead of sending a new message. */
  resume?: boolean;
}

interface ActiveTurn {
  requestId: string;
  controller: AbortController;
  /** Resolves when the underlying turn reaches a terminal state. */
  completed: Promise<void>;
}

/** Session id → active turn. Lives in the Next process; never sent to the browser. */
const activeTurns = new Map<string, ActiveTurn>();

export function isSessionActive(sessionId: string): boolean {
  return activeTurns.has(sessionId);
}

/** Abort the server-side turn for a session (Stop button / watchdog). */
export async function abortTurn(
  sessionId: string,
  client: OpenCodeClient,
): Promise<void> {
  const turn = activeTurns.get(sessionId);
  if (turn) turn.controller.abort();
  try {
    await client.abort(sessionId);
  } catch {
    // Best effort — registry cleanup still resolves the turn.
  }
}

const encoder = new TextEncoder();

/**
 * Run (or attach to) one chat turn, streaming NDJSON frontend events.
 * The returned stream always ends with a `done` event.
 */
export function runTurn(
  client: OpenCodeClient,
  config: OpenCodeConfig,
  input: TurnInput,
): ReadableStream<Uint8Array> {
  const requestId = input.requestId || newOpenCodeRequestId();
  const log = createOpencodeLogger({
    chatId: input.chatId,
    sessionId: input.sessionId,
    requestId,
  });
  const sessionIdSafe =
    input.sessionId && /^[A-Za-z0-9_-]{1,64}$/.test(input.sessionId)
      ? input.sessionId
      : undefined;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let terminated = false; // watchdog fired — ignore late events/errors

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const emit = (event: OpenCodeFrontendEvent) => {
        if (closed || terminated) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The consumer (browser) cancelled the stream — e.g. a page refresh
          // mid-turn. The turn keeps running server-side for resume, but
          // there is nobody to emit to anymore.
          closed = true;
        }
      };
      const finish = (event?: OpenCodeFrontendEvent) => {
        if (terminated) return;
        if (event) emit(event);
        emit({ type: "done", stopReason: "end" });
        close();
      };
      const fail = (event: OpenCodeFrontendEvent) => {
        emit(event);
        emit({ type: "done", stopReason: "error" });
        close();
      };

      // ── Resume path: attach to a live turn, no new message. ─────────────
      if (input.resume) {
        const turn = sessionIdSafe ? activeTurns.get(sessionIdSafe) : undefined;
        if (!turn) {
          log.warn("Resume requested but no active turn", {
            sessionId: input.sessionId,
          });
          fail({
            type: "error",
            message:
              "No active response to resume — the reply was interrupted.",
          });
          return;
        }
        log.log("Attaching to active turn", {
          sessionId: sessionIdSafe,
          turnRequestId: turn.requestId,
        });
        emit({ type: "resumed" });
        try {
          await emitSnapshot(client, sessionIdSafe!, emit, log);
          const unsubscribe = eventBus.subscribe(sessionIdSafe!, (event) => {
            for (const e of sessionEventToFrontend(event)) emit(e);
          });
          void turn.completed.then(() => {
            emit({ type: "done", stopReason: "end" });
            unsubscribe();
            close();
          });
          // Stream stays open until the underlying turn completes.
          await turn.completed;
        } catch (e) {
          log.error("Resume failed", { error: userMessage(e) });
          fail({ type: "error", message: userMessage(e) });
        }
        return;
      }

      // ── Concurrency guard: one turn per session, deterministic. ────────
      if (sessionIdSafe && activeTurns.has(sessionIdSafe)) {
        log.warn("Session already busy", { sessionId: sessionIdSafe });
        fail({
          type: "error",
          message:
            "The AI is already responding in this chat — wait for it to finish before sending another message.",
        });
        return;
      }

      const abortController = new AbortController();
      const onCallerAbort = () => abortController.abort();
      if (input.signal) {
        if (input.signal.aborted) abortController.abort();
        else
          input.signal.addEventListener("abort", onCallerAbort, { once: true });
      }

      let completedResolve!: () => void;
      const completed = new Promise<void>((resolve) => {
        completedResolve = resolve;
      });
      const active: ActiveTurn = {
        requestId,
        controller: abortController,
        completed,
      };
      if (sessionIdSafe) activeTurns.set(sessionIdSafe, active);

      const state = createTranslationState();
      let unsubscribe: (() => void) | null = null;
      let resolvedSessionId = "";
      let firstEventTimer: ReturnType<typeof setTimeout> | null = null;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let totalTimer: ReturnType<typeof setTimeout> | null = null;
      let sawEvent = false;
      /**
       * True while the turn is parked on a user approval/question — the idle
       * watchdog is suspended so a slow-to-review user never gets the turn
       * killed mid-interaction (the total watchdog still bounds it).
       */
      let waitingOnUser = false;
      /**
       * Turns that interacted with the user get a longer idle window for the
       * rest of the turn: resuming after an answer involves a fresh model
       * generation that can easily exceed the plain idle budget on slow
       * providers.
       */
      let interactiveTurn = false;

      const killTurn = (message: string, kind: "error") => {
        // Emit BEFORE marking terminated — the emit guard would swallow this.
        emit({ type: kind, message });
        emit({ type: "done", stopReason: "end" });
        close();
        terminated = true;
        void abortTurn(resolvedSessionId || sessionIdSafe || "", client).catch(
          () => {},
        );
      };

      const resetIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        const windowMs = interactiveTurn
          ? Math.max(config.idleMs, 3 * 60_000)
          : config.idleMs;
        idleTimer = setTimeout(
          () =>
            killTurn(
              `The AI stopped responding mid-reply (${Math.round(windowMs / 1000)}s of silence) — retry to continue.`,
              "error",
            ),
          windowMs,
        );
      };

      const handleEvent = (event: OpenCodeEvent) => {
        if (terminated) return;
        if (
          event.type === "permission.asked" ||
          event.type === "question.asked"
        ) {
          // Parked on the user — suspend the idle watchdog entirely.
          waitingOnUser = true;
          interactiveTurn = true;
          if (idleTimer) clearTimeout(idleTimer);
        } else if (
          event.type === "permission.replied" ||
          event.type === "question.replied" ||
          event.type === "question.rejected"
        ) {
          // The user answered — resume normal (extended) idle tracking.
          waitingOnUser = false;
          if (!sawEvent) {
            sawEvent = true;
            if (firstEventTimer) clearTimeout(firstEventTimer);
          }
          resetIdle();
        } else if (!waitingOnUser) {
          if (!sawEvent) {
            sawEvent = true;
            if (firstEventTimer) clearTimeout(firstEventTimer);
            resetIdle();
          } else {
            resetIdle();
          }
        }
        if (event.type === "message.part.updated") {
          const part = event.properties.part as OpenCodePart | undefined;
          if (!part) return;
          for (const e of partUpdatedEvents(
            state,
            part,
            event.properties.delta,
          ))
            emit(e);
          return;
        }
        for (const e of sessionEventToFrontend(event)) emit(e);
      };

      try {
        // Ensure (or repair) the session before subscribing.
        const ensured = await ensureSession(client, sessionIdSafe, {
          directory: input.directory || config.workspaceDir,
          title: `MasarFlow · ${input.chatId}`,
          config,
        });
        if (!ensured) {
          fail({
            type: "error",
            message:
              "The AI agent service is unavailable — start it and retry.",
          });
          return;
        }
        resolvedSessionId = ensured.session.id;
        const sessionId = resolvedSessionId;
        if (!sessionIdSafe || ensured.created) {
          // New session (or a repaired one) — the client must persist the id.
          emit({ type: "session_created", sessionId });
        }
        log.log("Turn started", {
          sessionId,
          directory: ensured.session.directory,
          model: input.modelId
            ? `${input.providerId}/${input.modelId}`
            : undefined,
          recreated: ensured.created,
        });

        unsubscribe = eventBus.subscribe(sessionId, handleEvent);

        // Agentic turns rely on the workspace functions being registered on
        // the server (create_note, read_spec, … via the browser bridge). When
        // they're missing, tell the user up front so a "create this note"
        // request doesn't fail mysteriously mid-turn.
        if (input.toolsEnabled) {
          const missing = await missingWorkspaceTools(client);
          if (missing && missing.length > 0) {
            emit({
              type: "notice",
              message: `The OpenCode server is missing MasarFlow's workspace functions (e.g. ${missing.slice(0, 3).join(", ")}). Restart it with \`npm run dev:full\` (or run \`npm run tools:install\`) so the agent can create and update notes, specs, and tasks in your project.`,
            });
          }
        }

        const promptInput: {
          text: string;
          attachments?: ChatAttachmentInput[];
          system?: string;
          model?: { providerID: string; modelID: string };
          agent?: string;
          tools?: Record<string, boolean>;
          sessionDir: string;
        } = {
          text: input.text,
          attachments: input.attachments,
          system: input.system,
          model:
            input.modelId && input.providerId
              ? { providerID: input.providerId, modelID: input.modelId }
              : undefined,
          agent: input.agent,
          sessionDir: ensured.session.directory,
        };
        const parts = await buildPromptParts(promptInput, log.log);
        if (!input.toolsEnabled) {
          // Chat mode: turn every known tool off for this message.
          promptInput.tools = await disabledTools(client);
        }
        const body = buildPromptBody(promptInput, parts);

        firstEventTimer = setTimeout(
          () =>
            killTurn(
              "The AI didn't start responding — it may be overloaded. Retry.",
              "error",
            ),
          config.firstEventMs,
        );
        totalTimer = setTimeout(
          () =>
            killTurn(
              `The AI ran for over ${Math.round(config.totalMs / 60000)} minutes and was stopped — retry, or try a smaller request.`,
              "error",
            ),
          config.totalMs,
        );

        log.log("Sending message", {
          sessionId,
          parts: parts.length,
          textLength: input.text.length,
        });
        const startedAt = Date.now();
        try {
          const result = await client.sendMessage(sessionId, body, {
            signal: abortController.signal,
          });
          log.log("Message completed", {
            sessionId,
            durationMs: Date.now() - startedAt,
            parts: result.parts.length,
            error: result.info.error?.name,
          });
          if (abortController.signal.aborted) {
            log.log("Turn cancelled after completion", { sessionId });
            finish({ type: "notice", message: "Stopped." });
            return;
          }
          // Reconcile: emit anything the SSE bus missed (reconnect case).
          emitReconcile(state, result.parts, emit);
          const err = classifyAssistantError(result.info.error);
          if (err) {
            log.error("Provider error", { sessionId, kind: err.kind });
            fail({ type: "error", message: err.message });
          } else {
            if (result.info.id)
              emit({ type: "message_id", messageId: result.info.id });
            finish();
          }
        } catch (e) {
          if (abortController.signal.aborted) {
            log.log("Turn cancelled", { sessionId });
            finish({ type: "notice", message: "Stopped." });
          } else {
            const err =
              e instanceof OpenCodeError
                ? e
                : new OpenCodeError("unknown", userMessage(e));
            log.error("Turn failed", { sessionId, kind: err.kind });
            fail({ type: "error", message: userMessage(err) });
          }
        } finally {
          if (totalTimer) clearTimeout(totalTimer);
          if (idleTimer) clearTimeout(idleTimer);
        }
      } catch (e) {
        if (abortController.signal.aborted) {
          finish({ type: "notice", message: "Stopped." });
        } else {
          log.error("Turn crashed", { error: userMessage(e) });
          fail({ type: "error", message: userMessage(e) });
        }
      } finally {
        if (firstEventTimer) clearTimeout(firstEventTimer);
        if (idleTimer) clearTimeout(idleTimer);
        if (unsubscribe) unsubscribe();
        input.signal?.removeEventListener("abort", onCallerAbort);
        if (sessionIdSafe) activeTurns.delete(sessionIdSafe);
        completedResolve();
        close();
      }
    },
    cancel() {
      // Browser disconnected — the OpenCode turn keeps running server-side so
      // a refresh can resume it. Cleanup happens when the turn completes.
    },
  });
}

/** Emit the current state of the in-flight assistant message (resume path). */
async function emitSnapshot(
  client: OpenCodeClient,
  sessionId: string,
  emit: (event: OpenCodeFrontendEvent) => void,
  log: ReturnType<typeof createOpencodeLogger>,
): Promise<void> {
  const messages = await client.listMessages(sessionId, { limit: 4 });
  const last = [...messages].reverse().find((m) => m.info.role === "assistant");
  if (!last) return;
  log.log("Snapshot", { messageId: last.info.id, parts: last.parts.length });
  for (const part of last.parts) {
    if (part.type === "text" && typeof part.text === "string" && part.text) {
      emit({ type: "text", text: part.text });
    } else if (
      part.type === "reasoning" &&
      typeof part.text === "string" &&
      part.text
    ) {
      emit({ type: "reasoning", text: part.text });
    } else if (part.type === "tool") {
      const p = part as OpenCodeToolPart;
      if (p.state.status === "completed" || p.state.status === "error") {
        const id = p.callID || p.id;
        emit({ type: "tool_call", id, name: p.tool, arguments: p.state.input });
        emit({
          type: "tool_result",
          id,
          name: p.tool,
          ok: p.state.status === "completed",
          content: (p.state.status === "completed"
            ? p.state.output
            : (p.state.error ?? "Tool failed")
          ).slice(0, TOOL_OUTPUT_CAP),
        });
      }
    }
  }
}

/** After the POST resolves, emit anything the live stream missed. */
function emitReconcile(
  state: TranslationState,
  parts: OpenCodePart[],
  emit: (event: OpenCodeFrontendEvent) => void,
): void {
  for (const part of parts) {
    if (part.type === "text") {
      const t = textPartDeltas(state, part, "");
      if (t) emit({ type: "text", text: t });
    } else if (part.type === "reasoning") {
      const t = reasoningDeltas(state, part, "");
      if (t) emit({ type: "reasoning", text: t });
    } else if (part.type === "tool" && !state.toolCalls.has(part.id)) {
      // Never seen live (SSE dropped): emit the call + its final state.
      const p = part as OpenCodeToolPart;
      const id = p.callID || p.id;
      state.toolCalls.set(part.id, id);
      emit({ type: "tool_call", id, name: p.tool, arguments: p.state.input });
      if (p.state.status === "completed") {
        emit({
          type: "tool_result",
          id,
          name: p.tool,
          ok: true,
          content: p.state.output.slice(0, TOOL_OUTPUT_CAP),
        });
      } else if (p.state.status === "error") {
        emit({
          type: "tool_result",
          id,
          name: p.tool,
          ok: false,
          content: (p.state.error ?? "Tool failed").slice(0, TOOL_OUTPUT_CAP),
        });
      }
    }
  }
}

/* ── Chat mode: disable every OpenCode tool for the message ─────────────── */

let toolIdsCache: { at: number; ids: string[] } | null = null;

/** All tool ids registered on the server (cached 5 min). */
export async function getToolIds(client: OpenCodeClient): Promise<string[]> {
  if (toolIdsCache && Date.now() - toolIdsCache.at < 300_000)
    return toolIdsCache.ids;
  try {
    const ids = await client.request<string[]>("/experimental/tool/ids", {
      timeoutMs: 5000,
    });
    toolIdsCache = { at: Date.now(), ids: Array.isArray(ids) ? ids : [] };
  } catch {
    toolIdsCache = { at: Date.now(), ids: [] };
  }
  return toolIdsCache.ids;
}

async function disabledTools(
  client: OpenCodeClient,
): Promise<Record<string, boolean>> {
  const ids = await getToolIds(client);
  const map: Record<string, boolean> = {};
  for (const id of ids) map[id] = false;
  return map;
}

let missingToolsCache: { at: number; missing: string[] | null } | null = null;

/**
 * The workspace functions the OpenCode server has NOT registered as tools
 * (cached 5 min). A server started before the `.opencode/tools/*.ts` files
 * existed won't have them until it restarts. Returns null when the tool
 * registry can't be queried (older server builds without the experimental
 * endpoint) — callers must NOT report "missing" in that case, since it
 * would be a false alarm. The first call on a fresh server compiles the
 * custom tools and can take a while, so this uses a generous timeout.
 */
async function missingWorkspaceTools(
  client: OpenCodeClient,
): Promise<string[] | null> {
  if (missingToolsCache && Date.now() - missingToolsCache.at < 300_000)
    return missingToolsCache.missing;
  let ids: string[] | null = null;
  try {
    const raw = await client.request<string[]>("/experimental/tool/ids", {
      timeoutMs: 60_000,
    });
    ids = Array.isArray(raw) ? raw : [];
  } catch {
    ids = null;
  }
  const missing =
    ids === null
      ? null
      : WORKSPACE_TOOL_NAMES.filter((name) => !ids.includes(name));
  missingToolsCache = { at: Date.now(), missing };
  return missing;
}

/** Test seam: clear the cached tool-registry check between cases. */
export function resetMissingToolsCacheForTests(): void {
  missingToolsCache = null;
}
