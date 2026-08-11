/**
 * Test harness for the OpenCode integration: a fake OpenCode server with a
 * push-based SSE bus, wired to both the client's fetchImpl and global fetch
 * (the event bus uses the global). Routes mirror the real 1.18.15 API.
 */

import { vi } from "vitest";

import type {
  OpenCodeMessage,
  OpenCodePart,
  SessionStatus,
} from "@/lib/opencode/types";
import { WORKSPACE_TOOL_NAMES } from "@/lib/ai/workspace-tool-defs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Push-based SSE stream the fake server uses to emit /global/event frames. */
export class SseBus {
  private controllers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  private stopped = false;

  stream(): ReadableStream<Uint8Array> {
    const controllers = this.controllers;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controllers.add(controller);
      },
    });
  }

  /** Emit one GlobalEvent frame. */
  push(directory: string, payload: unknown): void {
    if (this.stopped) return;
    const frame = JSON.stringify({ directory, project: directory, payload });
    for (const c of [...this.controllers]) {
      try {
        c.enqueue(encoder.encode(`data: ${frame}\n\n`));
      } catch {
        this.controllers.delete(c);
      }
    }
  }

  /** Close every subscriber stream (simulates a server restart). */
  stop(): void {
    this.stopped = true;
    for (const c of [...this.controllers]) c.close();
    this.controllers.clear();
  }
}

export interface FakeSession {
  id: string;
  directory: string;
  title?: string;
  status: SessionStatus;
}

export interface FakeServerOptions {
  sessions?: FakeSession[];
  /** sendMessage handler — default returns a text part after 1ms. */
  onSendMessage?: (id: string, body: unknown) => Promise<OpenCodeMessage>;
  onListMessages?: (id: string) => Promise<OpenCodeMessage[]>;
  sendDelayMs?: number;
  /** Whether POST /session/{id}/message should hang until the test resolves it. */
  pendingSends?: Map<string, (result: OpenCodeMessage) => void>;
  /**
   * Tool ids served by /experimental/tool/ids. Defaults to the native tools
   * PLUS the MasarFlow workspace functions — the standard dev:full setup.
   * Pass a list without the workspace names to simulate a stale server.
   */
  toolIds?: string[];
}

export class FakeOpenCodeServer {
  readonly sse = new SseBus();
  sessions = new Map<string, FakeSession>();
  abortCalls: string[] = [];
  permissionReplies: {
    sessionId: string;
    permissionId: string;
    response: string;
  }[] = [];
  deleteCalls: string[] = [];
  private opts: FakeServerOptions;
  private messageSeq = 0;
  private partSeq = 0;

  constructor(opts: FakeServerOptions = {}) {
    this.opts = opts;
    for (const s of opts.sessions ?? []) this.sessions.set(s.id, s);
  }

  private json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  textPart(text: string): OpenCodePart {
    this.partSeq += 1;
    return {
      id: `prt_${this.partSeq}`,
      sessionID: "",
      messageID: "",
      type: "text",
      text,
    };
  }

  message(
    role: "user" | "assistant",
    parts: OpenCodePart[],
    extra: Partial<OpenCodeMessage["info"]> = {},
  ): OpenCodeMessage {
    this.messageSeq += 1;
    const id = `msg_${this.messageSeq}`;
    return {
      info: {
        id,
        sessionID: "",
        role,
        time: { created: Date.now(), completed: Date.now() },
        ...extra,
      },
      parts: parts.map((p) => ({ ...p, sessionID: "", messageID: id })),
    };
  }

  /** fetchImpl + global stub: routes the real API paths to this fake. */
  readonly fetchImpl: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? new URL(input)
        : new URL((input as Request).url);
    const method = init?.method ?? "GET";
    const path = url.pathname;
    const body = init?.body
      ? (JSON.parse(init.body as string) as unknown)
      : undefined;

    if (path === "/global/health" && method === "GET") {
      return this.json({ healthy: true, version: "1.18.15" });
    }
    if (path === "/global/event" && method === "GET") {
      return new Response(this.sse.stream(), {
        headers: { "content-type": "text/event-stream" },
      });
    }
    if (path === "/session" && method === "POST") {
      const dir = url.searchParams.get("directory") ?? "";
      const id = `ses_${Math.random().toString(36).slice(2, 10)}`;
      const session: FakeSession = {
        id,
        directory: dir,
        title: (body as { title?: string } | undefined)?.title,
        status: { type: "idle" },
      };
      this.sessions.set(id, session);
      return this.json({
        id,
        projectID: "proj",
        directory: dir,
        title: session.title,
        version: "1.18.15",
        time: { created: Date.now(), updated: Date.now() },
      });
    }
    if (path === "/session/status" && method === "GET") {
      const out: Record<string, SessionStatus> = {};
      for (const s of this.sessions.values()) out[s.id] = s.status;
      return this.json(out);
    }
    const sessionMatch = /^\/session\/(ses_[A-Za-z0-9]+)$/.exec(path);
    if (sessionMatch && method === "GET") {
      const s = this.sessions.get(sessionMatch[1]);
      return s
        ? this.json({
            id: s.id,
            projectID: "proj",
            directory: s.directory,
            title: s.title,
            version: "1.18.15",
            time: { created: 0, updated: 0 },
          })
        : this.json(
            { name: "NotFoundError", data: { message: "not found" } },
            404,
          );
    }
    if (sessionMatch && method === "DELETE") {
      this.deleteCalls.push(sessionMatch[1]);
      this.sessions.delete(sessionMatch[1]);
      return this.json(true);
    }
    if (
      /^\/session\/(ses_[A-Za-z0-9]+)\/abort$/.test(path) &&
      method === "POST"
    ) {
      const id = /^\/session\/(ses_[A-Za-z0-9]+)\/abort$/.exec(path)![1];
      this.abortCalls.push(id);
      return this.json(true);
    }
    if (/^\/session\/(ses_[A-Za-z0-9]+)\/message$/.test(path)) {
      const id = /^\/session\/(ses_[A-Za-z0-9]+)\/message$/.exec(path)![1];
      if (method === "GET") {
        const list = this.opts.onListMessages
          ? await this.opts.onListMessages(id)
          : [];
        return this.json(list);
      }
      if (method === "POST") {
        const session = this.sessions.get(id);
        if (!session)
          return this.json(
            { name: "NotFoundError", data: { message: "session not found" } },
            404,
          );
        session.status = { type: "busy" };
        const delay = this.opts.sendDelayMs ?? 1;
        // Respect the caller's abort signal (watchdogs/cancellation) so the
        // client's fetch rejects and the turn's cleanup always runs.
        const abortSignal = init?.signal as AbortSignal | undefined;
        const abortPromise = abortSignal
          ? new Promise<never>((_, reject) => {
              if (abortSignal.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
              }
              abortSignal.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true },
              );
            })
          : null;
        try {
          await Promise.race([
            new Promise((r) => setTimeout(r, delay)),
            ...(abortPromise ? [abortPromise] : []),
          ]);
        } catch {
          return this.json(
            { name: "MessageAbortedError", data: { message: "aborted" } },
            499,
          );
        }
        if (this.opts.onSendMessage) {
          const result = await this.opts.onSendMessage(id, body);
          session.status = { type: "idle" };
          return this.json(result);
        }
        const result = this.message("assistant", [
          this.textPart("Hello from fake opencode."),
        ]);
        session.status = { type: "idle" };
        return this.json(result);
      }
    }
    if (
      /^\/session\/(ses_[A-Za-z0-9]+)\/permissions\/([A-Za-z0-9_-]+)$/.test(
        path,
      ) &&
      method === "POST"
    ) {
      const m =
        /^\/session\/(ses_[A-Za-z0-9]+)\/permissions\/([A-Za-z0-9_-]+)$/.exec(
          path,
        )!;
      this.permissionReplies.push({
        sessionId: m[1],
        permissionId: m[2],
        response: (body as { response: string }).response,
      });
      return this.json(true);
    }
    if (
      /^\/session\/(ses_[A-Za-z0-9]+)\/revert$/.test(path) &&
      method === "POST"
    ) {
      return this.json(true);
    }
    if (path === "/provider" && method === "GET") {
      return this.json({
        all: [
          {
            id: "fake",
            name: "Fake Provider",
            source: "config",
            models: {
              "fake-model-1": {
                id: "fake-model-1",
                providerID: "fake",
                name: "Fake Model 1",
                capabilities: {
                  reasoning: true,
                  attachment: false,
                  toolcall: true,
                  temperature: true,
                },
              },
            },
          },
        ],
        connected: ["fake"],
        default: {},
      });
    }
    if (path === "/experimental/tool/ids" && method === "GET") {
      return this.json(
        this.opts.toolIds ?? [
          "read",
          "bash",
          "edit",
          "webfetch",
          "glob",
          "grep",
          "list",
          ...WORKSPACE_TOOL_NAMES,
        ],
      );
    }
    return this.json(
      {
        name: "NotFoundError",
        data: { message: `no route ${method} ${path}` },
      },
      404,
    );
  };

  /** Install the fake as global fetch (the shared event bus uses it). */
  installGlobal(): void {
    vi.stubGlobal("fetch", this.fetchImpl);
  }

  static async restoreGlobal(): Promise<void> {
    vi.unstubAllGlobals();
  }
}

/** Drain a ReadableStream<Uint8Array> of NDJSON lines → parsed events. */
export async function drainNdjson(
  stream: ReadableStream<Uint8Array>,
): Promise<unknown[]> {
  const reader = stream.getReader();
  const out: unknown[] = [];
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      out.push(JSON.parse(line));
    }
  }
  if (buffer.trim()) out.push(JSON.parse(buffer));
  return out;
}
