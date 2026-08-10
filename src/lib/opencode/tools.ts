/**
 * Translation of OpenCode parts/events into the frontend's NDJSON event
 * protocol (the same shape the old /api/chat proxy emitted, extended with
 * tool_running / step / file / approval events).
 *
 * Text streaming: OpenCode delivers `message.part.updated` frames with the
 * accumulated `part.text` and an optional `delta`. Deltas are preferred;
 * when absent, the accumulated text is diffed per part id so the UI never
 * re-renders duplicate content after an SSE reconnect.
 */

import type {
  OpenCodeEvent,
  OpenCodeFrontendEvent,
  OpenCodePart,
  OpenCodeToolPart,
} from "./types";

/** Result caps — tool output must never blow up a chat message. */
export const TOOL_OUTPUT_CAP = 16_000;

export interface TranslationState {
  /** Part id → last text length seen (for delta-by-diff on reconnect). */
  textLengths: Map<string, number>;
  /** Tool part id → call id (dedupe tool_call emissions). */
  toolCalls: Map<string, string>;
  step: number;
}

export function createTranslationState(): TranslationState {
  return { textLengths: new Map(), toolCalls: new Map(), step: 0 };
}

const deltaText = (delta: unknown, fallback: string): string =>
  typeof delta === "string" ? delta : fallback;

/** Emit text deltas for a text part, deduplicating already-seen content. */
export function textPartDeltas(
  state: TranslationState,
  part: OpenCodePart,
  delta: unknown,
): string {
  if (part.type !== "text") return "";
  const accumulated = typeof part.text === "string" ? part.text : "";
  const direct = deltaText(delta, "");
  if (direct) {
    state.textLengths.set(part.id, accumulated.length);
    return direct;
  }
  const seen = state.textLengths.get(part.id) ?? 0;
  if (accumulated.length <= seen) return "";
  state.textLengths.set(part.id, accumulated.length);
  return accumulated.slice(seen);
}

/** Reasoning deltas (same diff strategy). */
export function reasoningDeltas(
  state: TranslationState,
  part: OpenCodePart,
  delta: unknown,
): string {
  if (part.type !== "reasoning") return "";
  const accumulated = typeof part.text === "string" ? part.text : "";
  const direct = deltaText(delta, "");
  if (direct) {
    state.textLengths.set(`r:${part.id}`, accumulated.length);
    return direct;
  }
  const seen = state.textLengths.get(`r:${part.id}`) ?? 0;
  if (accumulated.length <= seen) return "";
  state.textLengths.set(`r:${part.id}`, accumulated.length);
  return accumulated.slice(seen);
}

/** Tool part state transitions → frontend tool events. */
export function toolPartEvents(
  state: TranslationState,
  part: OpenCodeToolPart,
): OpenCodeFrontendEvent[] {
  const events: OpenCodeFrontendEvent[] = [];
  const callId = part.callID || part.id;
  const name = part.tool || "tool";
  const prevCall = state.toolCalls.get(part.id);

  switch (part.state.status) {
    case "pending": {
      const input = part.state.input ?? {};
      // Emit the call once, with the arguments the model requested.
      if (!prevCall) {
        state.toolCalls.set(part.id, callId);
        events.push({ type: "tool_call", id: callId, name, arguments: input });
      }
      break;
    }
    case "running":
      events.push({
        type: "tool_running",
        id: callId,
        name,
        title: part.state.title,
      });
      break;
    case "completed":
      events.push({
        type: "tool_result",
        id: callId,
        name,
        ok: true,
        content: (part.state.output ?? "").slice(0, TOOL_OUTPUT_CAP),
      });
      break;
    case "error":
      events.push({
        type: "tool_result",
        id: callId,
        name,
        ok: false,
        content: (part.state.error ?? "Tool failed").slice(0, TOOL_OUTPUT_CAP),
      });
      break;
  }
  return events;
}

/** A single message.part.updated frame → frontend events. */
export function partUpdatedEvents(
  state: TranslationState,
  part: OpenCodePart,
  delta: unknown,
): OpenCodeFrontendEvent[] {
  switch (part.type) {
    case "text": {
      const t = textPartDeltas(state, part, delta);
      return t ? [{ type: "text", text: t }] : [];
    }
    case "reasoning": {
      const t = reasoningDeltas(state, part, delta);
      return t ? [{ type: "reasoning", text: t }] : [];
    }
    case "tool":
      return toolPartEvents(state, part as OpenCodeToolPart);
    case "step-start":
      state.step += 1;
      return [{ type: "step", step: state.step }];
    case "patch": {
      const files = (part as { files?: string[] }).files ?? [];
      return files.map((f) => ({ type: "file" as const, path: f }));
    }
    default:
      return [];
  }
}

/** Session-scoped events (message.updated / session.* / permission.*) → frontend events. */
export function sessionEventToFrontend(
  event: OpenCodeEvent,
): OpenCodeFrontendEvent[] {
  switch (event.type) {
    case "session.status": {
      const status = event.properties.status as
        { type?: string; attempt?: number; message?: string } | undefined;
      if (status?.type === "retry") {
        return [
          {
            type: "notice",
            message: `OpenCode is retrying the provider (attempt ${status.attempt ?? 1})${status.message ? `: ${status.message}` : ""}.`,
          },
        ];
      }
      return [];
    }
    case "session.error":
      return [
        {
          type: "error",
          message: "The AI agent reported an error — retry to continue.",
        },
      ];
    case "permission.asked": {
      // opencode 1.18.x wire format: properties = { id, sessionID,
      // permission, pattern, title } (permission.v2.asked frames are already
      // normalized to this shape by the server). Older builds used
      // "permission.updated" with the Permission object directly — handled
      // by the next case.
      const p = event.properties as {
        id?: string;
        permission?: string;
        type?: string;
        title?: string;
        pattern?: string | string[];
      };
      const type = p.permission ?? p.type;
      if (!p.id || !type) return [];
      return [
        {
          type: "approval",
          permissionId: p.id,
          permissionType: type,
          title: p.title ?? type,
          pattern: typeof p.pattern === "string" ? p.pattern : undefined,
        },
      ];
    }
    case "permission.updated": {
      // properties IS the Permission object on this wire format.
      const p = event.properties as {
        id?: string;
        type?: string;
        title?: string;
        pattern?: string | string[];
      };
      if (!p.id || !p.type) return [];
      return [
        {
          type: "approval",
          permissionId: p.id,
          permissionType: p.type,
          title: p.title ?? p.type,
          pattern: typeof p.pattern === "string" ? p.pattern : undefined,
        },
      ];
    }
    case "question.asked": {
      // opencode QuestionRequest: { id, sessionID, questions, tool? }.
      const p = event.properties as {
        id?: string;
        sessionID?: string;
        questions?: {
          header?: string;
          question?: string;
          options?: { label?: string; description?: string }[];
          multiple?: boolean;
          custom?: boolean;
        }[];
      };
      const questions = (p.questions ?? [])
        .map((q) => ({
          header: String(q?.header ?? ""),
          question: String(q?.question ?? ""),
          options: (q?.options ?? []).map((o) => ({
            label: String(o?.label ?? ""),
            description:
              o?.description !== undefined ? String(o.description) : undefined,
          })),
          multiple: q?.multiple ?? false,
          custom: q?.custom ?? true,
        }))
        .filter((q) => q.header || q.question);
      if (!p.id || !p.sessionID || questions.length === 0) return [];
      return [
        {
          type: "question",
          questionId: p.id,
          sessionId: p.sessionID,
          questions,
        },
      ];
    }
    case "question.replied":
    case "question.rejected":
      // Answered or dismissed elsewhere (another tab, the CLI, …) — tell the
      // chat UI to drop any matching dialog so it doesn't linger forever.
      return [{ type: "question_dismissed" }];
    default:
      return [];
  }
}
