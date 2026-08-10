/**
 * OpenCode server wire types (verified against the installed 1.18.15 server's
 * OpenAPI spec at /doc). Only the subset MasarFlow uses is mirrored here —
 * the server's own generated SDK would be the alternative, but a hand-rolled
 * minimal client keeps the integration dependency-free and testable.
 */

/* ── Sessions ─────────────────────────────────────────────────────────── */

export interface OpenCodeSession {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  title: string;
  version: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
  };
  summary?: {
    additions: number;
    deletions: number;
    files: number;
  };
  share?: { url: string };
}

export type SessionStatus =
  | { type: "idle" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | { type: "busy" };

/** Permission rule passed at session creation (PermissionRuleset). */
export interface PermissionRule {
  permission: string;
  pattern: string;
  action: "allow" | "deny" | "ask";
}

/* ── Messages ─────────────────────────────────────────────────────────── */

export interface OpenCodeMessageInfo {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: { created: number; completed?: number };
  error?: OpenCodeMessageError;
  finish?: string;
  cost?: number;
  tokens?: unknown;
}

/** Error object embedded in AssistantMessage / session.error events. */
export type OpenCodeMessageError =
  | { name: "ProviderAuthError"; data: { providerID: string; message: string } }
  | { name: "UnknownError"; data: { message: string } }
  | { name: "MessageOutputLengthError"; data: Record<string, unknown> }
  | { name: "MessageAbortedError"; data: { message: string } }
  | {
      name: "APIError";
      data: {
        message: string;
        statusCode?: number;
        isRetryable: boolean;
        responseHeaders?: Record<string, string>;
        responseBody?: string;
      };
    };

export interface OpenCodeMessage {
  info: OpenCodeMessageInfo;
  parts: OpenCodePart[];
}

/* ── Parts ────────────────────────────────────────────────────────────── */

export interface OpenCodePartBase {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
}

export interface OpenCodeTextPart extends OpenCodePartBase {
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
}

export interface OpenCodeReasoningPart extends OpenCodePartBase {
  type: "reasoning";
  text: string;
}

export interface OpenCodeToolPart extends OpenCodePartBase {
  type: "tool";
  callID: string;
  tool: string;
  state: OpenCodeToolState;
}

export type OpenCodeToolState =
  | { status: "pending"; input: Record<string, unknown>; raw: string }
  | {
      status: "running";
      input: Record<string, unknown>;
      title?: string;
      metadata?: Record<string, unknown>;
      time: { start: number };
    }
  | {
      status: "completed";
      input: Record<string, unknown>;
      output: string;
      title: string;
      metadata: Record<string, unknown>;
      time: { start: number; end: number; compacted?: number };
    }
  | {
      status: "error";
      input: Record<string, unknown>;
      error: string;
      metadata?: Record<string, unknown>;
      time: { start: number; end: number };
    };

export interface OpenCodeStepStartPart extends OpenCodePartBase {
  type: "step-start";
  snapshot?: string;
}

export interface OpenCodeStepFinishPart extends OpenCodePartBase {
  type: "step-finish";
  reason: string;
  snapshot?: string;
  cost: number;
  tokens: Record<string, unknown>;
}

export interface OpenCodePatchPart extends OpenCodePartBase {
  type: "patch";
  hash: string;
  files: string[];
}

export interface OpenCodeSnapshotPart extends OpenCodePartBase {
  type: "snapshot";
  snapshot: string;
}

export interface OpenCodeAgentPart extends OpenCodePartBase {
  type: "agent";
  name: string;
}

export interface OpenCodeFilePart extends OpenCodePartBase {
  type: "file";
  mime: string;
  filename?: string;
  url: string;
}

export interface OpenCodeCompactionPart extends OpenCodePartBase {
  type: "compaction";
  auto: boolean;
}

export type OpenCodePart =
  | OpenCodeTextPart
  | OpenCodeReasoningPart
  | OpenCodeToolPart
  | OpenCodeStepStartPart
  | OpenCodeStepFinishPart
  | OpenCodePatchPart
  | OpenCodeSnapshotPart
  | OpenCodeAgentPart
  | OpenCodeFilePart
  | OpenCodeCompactionPart
  | (OpenCodePartBase & { [key: string]: unknown });

/* ── Events (SSE) ─────────────────────────────────────────────────────── */

export interface OpenCodeEvent {
  id?: string;
  type: string;
  properties: Record<string, unknown>;
}

/** One frame on GET /global/event. */
export interface OpenCodeGlobalEvent {
  directory: string;
  project?: string;
  workspace?: string;
  payload: OpenCodeEvent;
}

export interface OpenCodePermission {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { created: number };
}

/* ── Providers / models ───────────────────────────────────────────────── */

export interface OpenCodeProvider {
  id: string;
  name: string;
  source: "env" | "config" | "custom" | "api";
  models: Record<string, OpenCodeModel>;
}

export interface OpenCodeModel {
  id: string;
  providerID: string;
  name: string;
  capabilities: {
    reasoning: boolean;
    attachment: boolean;
    toolcall: boolean;
    temperature: boolean;
  };
  limit?: { context?: number; output?: number };
  status?: string;
}

export interface OpenCodeProvidersResponse {
  all: OpenCodeProvider[];
  connected: string[];
  default?: Record<string, string>;
}

/* ── Part input (POST /session/{id}/message) ──────────────────────────── */

export type OpenCodePartInput =
  | { id?: string; type: "text"; text: string; synthetic?: boolean }
  | {
      id?: string;
      type: "file";
      mime: string;
      filename?: string;
      url: string;
      source?: {
        text: { value: string; start: number; end: number };
        type: "file";
        path: string;
      };
    };

export interface OpenCodePromptBody {
  messageID?: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  noReply?: boolean;
  system?: string;
  tools?: Record<string, boolean>;
  parts: OpenCodePartInput[];
}

/* ── Frontend event protocol (NDJSON lines from /api/opencode/send) ───── */

/** One question in a question.asked request (opencode QuestionInfo). */
export interface OpenCodeQuestionInfo {
  /** Complete question. */
  question: string;
  /** Very short label (max 30 chars). */
  header: string;
  /** Available choices (label + optional description). */
  options: { label: string; description?: string }[];
  /** Allow selecting multiple choices (default false). */
  multiple?: boolean;
  /** Allow typing a custom answer (default true). */
  custom?: boolean;
}

export type OpenCodeFrontendEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | { type: "tool_running"; id: string; name: string; title?: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      content: string;
    }
  | { type: "step"; step: number }
  | { type: "file"; path: string }
  | {
      type: "approval";
      permissionId: string;
      permissionType: string;
      title: string;
      pattern?: string;
    }
  /** The AI used the `question` tool — show a question dialog in the UI. */
  | {
      type: "question";
      questionId: string;
      sessionId: string;
      questions: OpenCodeQuestionInfo[];
    }
  /** A pending question was answered/rejected elsewhere — dismiss the dialog. */
  | { type: "question_dismissed" }
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  | { type: "done"; stopReason: "end" | "error" }
  /** The stored session was missing and got recreated — persist the new id. */
  | { type: "session_created"; sessionId: string }
  /** Attached to an already-running turn (browser refresh recovery). */
  | { type: "resumed" }
  /** The OpenCode message backing the finished reply (for file undo). */
  | { type: "message_id"; messageId: string };
