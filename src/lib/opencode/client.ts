/**
 * Thin HTTP client for the OpenCode server (verified endpoints, v1.18.15).
 * Adds basic auth from config, classifies HTTP failures into OpenCodeError,
 * and exposes every endpoint MasarFlow uses. No credentials are ever logged.
 */

import type { OpenCodeConfig } from "./config";
import { opencodeConfig } from "./config";
import { OpenCodeError, classifyHttp } from "./errors";
import type {
  OpenCodeMessage,
  OpenCodeModel,
  OpenCodePartInput,
  OpenCodePromptBody,
  OpenCodeProvider,
  OpenCodeProvidersResponse,
  OpenCodeSession,
  PermissionRule,
  SessionStatus,
} from "./types";

export interface OpenCodeClientOptions {
  config: OpenCodeConfig;
  /** Test seam for the underlying fetch. */
  fetchImpl?: typeof fetch;
  /** Default per-request timeout (ms); 0 = no timeout. */
  timeoutMs?: number;
}

export class OpenCodeClient {
  private readonly config: OpenCodeConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: OpenCodeClientOptions) {
    this.config = opts.config;
    // Resolve global fetch lazily so the process-wide cached client always
    // talks to the CURRENT global (tests stub it per case).
    this.fetchImpl =
      opts.fetchImpl ??
      (((...args) => globalThis.fetch(...args)) as typeof fetch);
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  private authHeaders(): Record<string, string> {
    if (!this.config.password) return {};
    const token = Buffer.from(
      `${this.config.username}:${this.config.password}`,
    ).toString("base64");
    return { authorization: `Basic ${token}` };
  }

  private url(path: string, query?: Record<string, string>): string {
    const u = new URL(path, `${this.config.baseUrl}/`);
    for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
    return u.toString();
  }

  async request<T>(
    path: string,
    opts: {
      method?: string;
      body?: unknown;
      query?: Record<string, string>;
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const { method = "GET", body, query, signal } = opts;
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    let res: Response;
    // Combine the caller's signal with the per-request timeout.
    let timeoutSignal: AbortSignal | undefined;
    if (timeoutMs > 0) {
      timeoutSignal =
        typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(timeoutMs)
          : undefined;
    }
    const effectiveSignal =
      signal && timeoutSignal
        ? AbortSignal.any([signal, timeoutSignal])
        : (signal ?? timeoutSignal);
    try {
      res = await this.fetchImpl(this.url(path, query), {
        method,
        headers: {
          "content-type": "application/json",
          ...this.authHeaders(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: effectiveSignal,
      });
    } catch (e) {
      if (effectiveSignal?.aborted) {
        if (signal?.aborted) {
          throw new OpenCodeError("cancelled", "The request was cancelled.", {
            cause: e,
          });
        }
        throw new OpenCodeError(
          "timeout",
          `The OpenCode request timed out after ${Math.round(timeoutMs / 1000)}s.`,
          { retryable: true, cause: e },
        );
      }
      throw new OpenCodeError(
        "unavailable",
        "The AI agent service is unreachable.",
        {
          retryable: true,
          cause: e,
        },
      );
    }
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw classifyHttp(res.status, text, {
        path,
        method,
        status: res.status,
      });
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new OpenCodeError(
        "malformed_event",
        "OpenCode returned an unparseable response.",
        {
          cause: { path, text: text.slice(0, 200) },
        },
      );
    }
  }

  /** GET /global/health — null when unreachable. Never throws. */
  async health(): Promise<{ healthy: boolean; version: string } | null> {
    try {
      return await this.request("/global/health", { timeoutMs: 2000 });
    } catch {
      return null;
    }
  }

  async createSession(
    directory: string,
    opts: {
      title?: string;
      model?: { providerID: string; modelID: string };
      permission?: PermissionRule[];
      signal?: AbortSignal;
    } = {},
  ): Promise<OpenCodeSession> {
    return this.request("/session", {
      method: "POST",
      query: { directory },
      body: {
        title: opts.title,
        model: opts.model,
        permission: opts.permission,
      },
      signal: opts.signal,
    });
  }

  async getSession(
    id: string,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession | null> {
    try {
      return await this.request(`/session/${encodeURIComponent(id)}`, {
        signal,
      });
    } catch (e) {
      if (e instanceof OpenCodeError && e.kind === "not_found") return null;
      throw e;
    }
  }

  async deleteSession(id: string, signal?: AbortSignal): Promise<boolean> {
    return this.request(`/session/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal,
    });
  }

  async sessionStatuses(
    signal?: AbortSignal,
  ): Promise<Record<string, SessionStatus>> {
    return this.request("/session/status", { signal });
  }

  async sendMessage(
    id: string,
    body: OpenCodePromptBody,
    opts: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<OpenCodeMessage> {
    return this.request(`/session/${encodeURIComponent(id)}/message`, {
      method: "POST",
      body,
      signal: opts.signal,
      timeoutMs: opts.timeoutMs ?? 0, // the POST resolves when the turn completes
    });
  }

  /** Fire-and-forget prompt (returns 204 immediately). */
  async promptAsync(
    id: string,
    body: OpenCodePromptBody,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.request(`/session/${encodeURIComponent(id)}/prompt_async`, {
      method: "POST",
      body,
      signal,
      timeoutMs: 10_000,
    });
  }

  async listMessages(
    id: string,
    opts: { limit?: number; signal?: AbortSignal } = {},
  ): Promise<OpenCodeMessage[]> {
    const query: Record<string, string> = {};
    if (opts.limit) query.limit = String(opts.limit);
    return this.request(`/session/${encodeURIComponent(id)}/message`, {
      query,
      signal: opts.signal,
    });
  }

  async abort(id: string, signal?: AbortSignal): Promise<boolean> {
    return this.request(`/session/${encodeURIComponent(id)}/abort`, {
      method: "POST",
      signal,
      timeoutMs: 10_000,
    });
  }

  async respondPermission(
    id: string,
    permissionId: string,
    response: "once" | "always" | "reject",
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.request(
      `/session/${encodeURIComponent(id)}/permissions/${encodeURIComponent(permissionId)}`,
      {
        method: "POST",
        body: { response },
        signal,
      },
    );
  }

  /**
   * Answer an opencode `question` request. `answers` is one entry per asked
   * question, each an array of selected labels (opencode QuestionReply).
   */
  async replyQuestion(
    requestId: string,
    answers: string[][],
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.request(`/question/${encodeURIComponent(requestId)}/reply`, {
      method: "POST",
      body: { answers },
      signal,
      timeoutMs: 10_000,
    });
  }

  /** Reject/dismiss an opencode `question` request (leave it unanswered). */
  async rejectQuestion(
    requestId: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.request(`/question/${encodeURIComponent(requestId)}/reject`, {
      method: "POST",
      body: {},
      signal,
      timeoutMs: 10_000,
    });
  }

  async revert(
    id: string,
    body: { messageID: string; partID?: string },
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.request(`/session/${encodeURIComponent(id)}/revert`, {
      method: "POST",
      body,
      signal,
    });
  }

  async providers(signal?: AbortSignal): Promise<OpenCodeProvidersResponse> {
    return this.request("/provider", { signal });
  }

  /**
   * Connected providers with a flat model list (for the chat pickers).
   * Returns [] on failure — the UI renders an "OpenCode unavailable" state.
   */
  async connectedModels(
    signal?: AbortSignal,
  ): Promise<{ provider: OpenCodeProvider; models: OpenCodeModel[] }[]> {
    const res = await this.providers(signal);
    const connected = new Set(res.connected ?? []);
    const out: { provider: OpenCodeProvider; models: OpenCodeModel[] }[] = [];
    for (const provider of res.all ?? []) {
      if (!connected.has(provider.id)) continue;
      const models = Object.values(provider.models ?? {});
      if (models.length) out.push({ provider, models });
    }
    return out;
  }
}

/** Convenience: build a client from the environment config. */
export function opencodeClient(
  opts: Partial<OpenCodeClientOptions> = {},
): OpenCodeClient {
  return new OpenCodeClient({
    config: opts.config ?? opencodeConfig(),
    ...opts,
  });
}

export type { OpenCodePartInput, OpenCodePromptBody };
