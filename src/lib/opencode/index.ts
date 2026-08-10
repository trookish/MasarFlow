/**
 * OpenCode integration layer — the backend's bridge to the headless OpenCode
 * server (chat agent runtime). The browser only ever talks to MasarFlow's own
 * API routes; this layer owns sessions, streaming, tools, approvals, errors,
 * and the connection lifecycle.
 */

export {
  OpenCodeClient,
  opencodeClient,
  type OpenCodeClientOptions,
} from "./client";
export { opencodeConfig, permissionRules, type OpenCodeConfig } from "./config";
export {
  OpenCodeError,
  classifyAssistantError,
  classifyHttp,
  safeDetail,
  userMessage,
  type OpenCodeErrorKind,
} from "./errors";
export { eventBus, parseSseFrames } from "./events";
export {
  createOpencodeLogger,
  newOpenCodeRequestId,
  type OpenCodeLogger,
} from "./logger";
export {
  buildPromptBody,
  buildPromptParts,
  type ChatAttachmentInput,
} from "./messages";
export { ensureSession, resolveSessionDirectory } from "./sessions";
export {
  createTranslationState,
  partUpdatedEvents,
  sessionEventToFrontend,
  textPartDeltas,
} from "./tools";
export {
  abortTurn,
  getToolIds,
  isSessionActive,
  runTurn,
  type TurnInput,
} from "./turn";
export type {
  OpenCodeEvent,
  OpenCodeFrontendEvent,
  OpenCodeGlobalEvent,
  OpenCodeMessage,
  OpenCodePart,
  OpenCodePermission,
  OpenCodePromptBody,
  OpenCodeProvider,
  OpenCodeSession,
  OpenCodeToolPart,
  SessionStatus,
} from "./types";
