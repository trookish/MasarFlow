/**
 * Structured logging for the OpenCode integration, correlated by
 * chatId/sessionId/requestId. Mirrors the [chat:…]/[AGENT:…]/[TOOL:…]
 * conventions so every turn is traceable in the server console. Never logs
 * credentials or sensitive payloads.
 */

export interface OpenCodeLogContext {
  chatId?: string;
  sessionId?: string;
  requestId?: string;
}

export type OpenCodeLogger = {
  log: (message: string, extra?: Record<string, unknown>) => void;
  warn: (message: string, extra?: Record<string, unknown>) => void;
  error: (message: string, extra?: Record<string, unknown>) => void;
};

export function createOpencodeLogger(
  context: OpenCodeLogContext = {},
): OpenCodeLogger {
  const base = {
    chatId: context.chatId ?? "",
    sessionId: context.sessionId ?? "",
    requestId: context.requestId ?? "",
  };
  const format = (
    level: string,
    message: string,
    extra?: Record<string, unknown>,
  ) =>
    `[opencode${context.requestId ? `:${context.requestId}` : ""}] ${message} ${JSON.stringify(
      { ...base, ...extra },
    )}`;

  return {
    log: (message, extra) => console.log(format("info", message, extra)),
    warn: (message, extra) => console.warn(format("warn", message, extra)),
    error: (message, extra) => console.error(format("error", message, extra)),
  };
}

let seq = 0;

/** Short unique id for correlating one turn's logs. */
export function newOpenCodeRequestId(): string {
  seq += 1;
  return `oc_${Date.now().toString(36)}_${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
