/**
 * OpenCode error taxonomy. Every failure mode of the OpenCode integration is
 * classified into a kind with a user-safe message; detailed technical info is
 * logged server-side and never leaks to the client.
 */

import type { OpenCodeMessageError } from "./types";

export type OpenCodeErrorKind =
  | "unavailable" // server unreachable / refused connection
  | "auth" // HTTP basic-auth failure against the server
  | "not_found" // session/message/permission no longer exists
  | "bad_request" // we sent something the server rejected
  | "provider_auth" // provider credentials missing/expired (inside OpenCode)
  | "provider_error" // upstream provider failure / rate limit
  | "rate_limit" // explicit 429 from the provider
  | "message_aborted" // OpenCode aborted the message itself
  | "output_length" // model output hit its token cap
  | "session_busy" // a turn is already running on this session
  | "timeout" // our watchdog fired
  | "stream_disconnected" // SSE connection dropped mid-turn
  | "cancelled" // user stopped the turn
  | "malformed_event" // unparseable event frame
  | "unknown";

export class OpenCodeError extends Error {
  readonly kind: OpenCodeErrorKind;
  /** HTTP status where applicable. */
  readonly status?: number;
  /** Whether retrying the same request can plausibly succeed. */
  readonly retryable: boolean;
  /** Original error/object, for server-side logging only. */
  readonly cause?: unknown;

  constructor(
    kind: OpenCodeErrorKind,
    message: string,
    opts: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "OpenCodeError";
    this.kind = kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.cause = opts.cause;
  }
}

/** Map an HTTP status + body from the OpenCode server to a classified error. */
export function classifyHttp(
  status: number,
  bodyText: string,
  cause?: unknown,
): OpenCodeError {
  if (status === 401 || status === 403) {
    return new OpenCodeError(
      "auth",
      "OpenCode rejected the server credentials.",
      {
        status,
        cause,
      },
    );
  }
  if (status === 404) {
    return new OpenCodeError(
      "not_found",
      "The OpenCode resource no longer exists.",
      {
        status,
        cause,
      },
    );
  }
  if (status === 400 || status === 422) {
    return new OpenCodeError("bad_request", "OpenCode rejected the request.", {
      status,
      cause,
    });
  }
  if (status === 429) {
    return new OpenCodeError(
      "rate_limit",
      "OpenCode is rate limiting requests — try again shortly.",
      {
        status,
        retryable: true,
        cause,
      },
    );
  }
  if (status >= 500) {
    return new OpenCodeError(
      "provider_error",
      "OpenCode reported a server error.",
      {
        status,
        retryable: true,
        cause,
      },
    );
  }
  return new OpenCodeError(
    "unknown",
    bodyText.slice(0, 200) || `OpenCode HTTP ${status}`,
    {
      status,
      cause,
    },
  );
}

/** Classify the error object OpenCode embeds in messages / session.error. */
export function classifyAssistantError(
  error: OpenCodeMessageError | undefined,
): OpenCodeError | null {
  if (!error) return null;
  switch (error.name) {
    case "ProviderAuthError":
      return new OpenCodeError(
        "provider_auth",
        "The AI provider is missing a valid key. Configure it in OpenCode (`opencode auth`) and retry.",
        { cause: error },
      );
    case "MessageAbortedError":
      return new OpenCodeError("message_aborted", "The response was aborted.", {
        cause: error,
      });
    case "MessageOutputLengthError":
      return new OpenCodeError(
        "output_length",
        "The response hit the model's output limit and was cut off — try a shorter request.",
        { cause: error },
      );
    case "APIError": {
      const data = error.data;
      const status = data.statusCode;
      const base = data.message || "The AI provider reported an error.";
      if (status === 401 || status === 403) {
        return new OpenCodeError(
          "provider_auth",
          "The AI provider rejected the API key. Check the key in OpenCode and retry.",
          { status, cause: error },
        );
      }
      if (status === 429) {
        return new OpenCodeError(
          "rate_limit",
          "The AI provider is rate limiting — wait a moment and retry.",
          { status, retryable: true, cause: error },
        );
      }
      if (status === 400 && /context|window|length|token/i.test(base)) {
        return new OpenCodeError(
          "bad_request",
          "The request exceeded the model's context window — the conversation was trimmed. Retry with a shorter message.",
          { status, cause: error },
        );
      }
      return new OpenCodeError(
        "provider_error",
        `The AI provider failed${status ? ` (${status})` : ""} — ${safeDetail(base)}`,
        { status, retryable: data.isRetryable, cause: error },
      );
    }
    default:
      return new OpenCodeError(
        "unknown",
        safeDetail(
          (error as { data?: { message?: string } }).data?.message ??
            "Unknown OpenCode error",
        ),
        {
          cause: error,
        },
      );
  }
}

/** User-safe truncation of an arbitrary detail string. */
export function safeDetail(text: string): string {
  return text.replace(/[A-Za-z0-9+/=_-]{40,}/g, "[redacted]").slice(0, 160);
}

/** Human message for an error, safe to show in the UI. */
export function userMessage(err: unknown): string {
  if (err instanceof OpenCodeError) return err.message;
  const msg = (err as Error)?.message ?? String(err);
  return safeDetail(msg);
}
