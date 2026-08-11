/**
 * Turn controller tests: happy path, tool sequences, concurrency, resume,
 * watchdogs, error classification, session repair, cancellation. The fake
 * OpenCode server (helpers.ts) drives both the client and the shared SSE bus.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { opencodeConfig, type OpenCodeConfig } from "@/lib/opencode/config";
import { OpenCodeClient } from "@/lib/opencode/client";
import { eventBus } from "@/lib/opencode/events";
import {
  runTurn,
  isSessionActive,
  abortTurn,
  resetMissingToolsCacheForTests,
} from "@/lib/opencode/turn";
import type { OpenCodeFrontendEvent } from "@/lib/opencode/types";

import { FakeOpenCodeServer, drainNdjson } from "./helpers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const config: OpenCodeConfig = {
  ...opencodeConfig(),
  baseUrl: "http://127.0.0.1:9999",
  workspaceDir: "C:\\workspace",
  permissions: { edit: "ask", bash: "ask", webfetch: "ask" },
  firstEventMs: 5_000,
  idleMs: 5_000,
  totalMs: 30_000,
};

const turn = (
  server: FakeOpenCodeServer,
  overrides: Partial<Parameters<typeof runTurn>[2]> = {},
) => {
  const client = new OpenCodeClient({ config, fetchImpl: server.fetchImpl });
  return runTurn(client, config, {
    chatId: "chat-1",
    sessionId: "ses_abc",
    text: "hello",
    toolsEnabled: true,
    ...overrides,
  });
};

describe("runTurn", () => {
  let server: FakeOpenCodeServer;

  beforeEach(() => {
    eventBus.resetForTests();
    resetMissingToolsCacheForTests();
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
    });
    server.installGlobal();
  });

  afterEach(async () => {
    eventBus.resetForTests();
    await FakeOpenCodeServer.restoreGlobal();
  });

  /** SSE events reach the bus only once the turn subscribes (~20ms in). */
  const pushAfterSubscribe = (payload: unknown, delayMs = 40) => {
    void sleep(delayMs).then(() => server.sse.push("C:\\workspace", payload));
  };

  it("streams text from the SSE bus and completes with done", async () => {
    // Keep the POST open long enough for the SSE events to stream in, and
    // make the POST result reuse the same part id that streamed (as the real
    // server does) so reconciliation adds nothing on top.
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 400,
      onSendMessage: async () =>
        server.message("assistant", [
          {
            id: "prt_1",
            sessionID: "ses_abc",
            messageID: "msg_1",
            type: "text",
            text: "Hello",
          },
        ]),
    });
    server.installGlobal();
    eventBus.resetForTests();

    pushAfterSubscribe({
      type: "message.part.updated",
      properties: {
        part: {
          id: "prt_1",
          sessionID: "ses_abc",
          messageID: "msg_1",
          type: "text",
          text: "Hel",
        },
        delta: "Hel",
      },
    });
    pushAfterSubscribe(
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "prt_1",
            sessionID: "ses_abc",
            messageID: "msg_1",
            type: "text",
            text: "Hello",
          },
          delta: "lo",
        },
      },
      120,
    );
    const events = (await drainNdjson(turn(server))) as OpenCodeFrontendEvent[];
    const types = events.map((e) => e.type);
    expect(types).toContain("text");
    expect(types).toContain("done");
    const text = events
      .filter((e) => e.type === "text")
      .map((e) => (e as { text: string }).text)
      .join("");
    expect(text).toBe("Hello");
    const done = events.find((e) => e.type === "done");
    expect(done).toEqual({ type: "done", stopReason: "end" });
  });

  it("emits a full tool lifecycle from part transitions", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 400,
      onSendMessage: async () => server.message("assistant", []),
    });
    server.installGlobal();
    eventBus.resetForTests();

    const toolPart = (id: string, state: unknown) => ({
      type: "message.part.updated",
      properties: {
        part: {
          id,
          sessionID: "ses_abc",
          messageID: "msg_1",
          type: "tool",
          callID: "c1",
          tool: "bash",
          state,
        },
      },
    });
    pushAfterSubscribe(
      toolPart("prt_1", {
        status: "pending",
        input: { command: "npm test" },
        raw: "",
      }),
    );
    pushAfterSubscribe(
      toolPart("prt_1", {
        status: "running",
        input: { command: "npm test" },
        time: { start: 0 },
      }),
      80,
    );
    pushAfterSubscribe(
      toolPart("prt_1", {
        status: "completed",
        input: { command: "npm test" },
        output: "ok",
        title: "npm test",
        metadata: {},
        time: { start: 0, end: 1 },
      }),
      160,
    );

    const events = (await drainNdjson(turn(server))) as OpenCodeFrontendEvent[];
    const types = events.map((e) => e.type);
    // No workspace-missing notice: this server registers the workspace tools.
    expect(types).not.toContain("notice");
    expect(types.slice(0, 3)).toEqual([
      "tool_call",
      "tool_running",
      "tool_result",
    ]);
    expect(types).toContain("message_id");
    expect(types.at(-1)).toBe("done");
    const call = events.find((e) => e.type === "tool_call") as {
      name: string;
      arguments: Record<string, unknown>;
    };
    expect(call.name).toBe("bash");
    expect(call.arguments).toEqual({ command: "npm test" });
  });

  it("warns once when the server never registered the workspace functions", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      // A stale server: only opencode's native tools, none of MasarFlow's.
      toolIds: ["read", "bash", "edit", "webfetch", "glob", "grep"],
      sendDelayMs: 200,
      onSendMessage: async () =>
        server.message("assistant", [
          {
            id: "prt_1",
            sessionID: "ses_abc",
            messageID: "msg_1",
            type: "text",
            text: "hi",
          },
        ]),
    });
    server.installGlobal();
    eventBus.resetForTests();

    const events = (await drainNdjson(turn(server))) as OpenCodeFrontendEvent[];
    const notices = events.filter((e) => e.type === "notice") as {
      message: string;
    }[];
    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0].message).toMatch(/workspace functions/i);
    expect(notices[0].message).toContain("create_note");
  });

  it("does not warn when the tool registry endpoint is unavailable", async () => {
    // An older server build without /experimental/tool/ids → the check must
    // stay silent (unknown ≠ missing).
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 200,
      onSendMessage: async () =>
        server.message("assistant", [
          {
            id: "prt_1",
            sessionID: "ses_abc",
            messageID: "msg_1",
            type: "text",
            text: "hi",
          },
        ]),
    });
    server.installGlobal();
    eventBus.resetForTests();

    const baseFetch = server.fetchImpl;
    const failingFetch = (async (
      url: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      if (String(url).includes("/experimental/tool/ids")) {
        return new Response("not found", { status: 404 });
      }
      return baseFetch(url, init);
    }) as typeof fetch;
    vi.stubGlobal("fetch", failingFetch);

    const events = (await drainNdjson(turn(server))) as OpenCodeFrontendEvent[];
    expect(events.filter((e) => e.type === "notice")).toHaveLength(0);
  });

  it("rejects a second concurrent turn on the same session", async () => {
    // First turn stays open (its sendMessage promise never resolves because
    // the fake's SSE keeps the stream alive? No — the first turn completes
    // quickly; instead hold it by delaying the fake send response).
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 200,
    });
    server.installGlobal();

    const first = drainNdjson(turn(server));
    await new Promise((r) => setTimeout(r, 20)); // let the first turn register
    expect(isSessionActive("ses_abc")).toBe(true);

    const events = (await drainNdjson(turn(server))) as OpenCodeFrontendEvent[];
    const err = events.find((e) => e.type === "error") as
      { message: string } | undefined;
    expect(err?.message).toMatch(/already responding/i);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "error" });
    expect(isSessionActive("ses_abc")).toBe(true); // first turn still owns it

    await first;
    expect(isSessionActive("ses_abc")).toBe(false);
  });

  it("reconciles missing text from the POST result when SSE was silent", async () => {
    // No SSE events at all — the final result parts must still reach the UI.
    const events = (await drainNdjson(turn(server))) as OpenCodeFrontendEvent[];
    const text = events
      .filter((e) => e.type === "text")
      .map((e) => (e as { text: string }).text)
      .join("");
    expect(text).toBe("Hello from fake opencode.");
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end" });
  });

  it("emits message_id for the file-undo flow", async () => {
    const events = (await drainNdjson(turn(server))) as OpenCodeFrontendEvent[];
    const mid = events.find((e) => e.type === "message_id") as
      { messageId: string } | undefined;
    expect(mid?.messageId).toMatch(/^msg_/);
  });

  it("repairs a missing session and emits session_created", async () => {
    // The stored session id no longer exists on the server.
    const events = (await drainNdjson(
      turn(server, { sessionId: "ses_gone" }),
    )) as OpenCodeFrontendEvent[];
    const created = events.find((e) => e.type === "session_created") as
      { sessionId: string } | undefined;
    expect(created?.sessionId).toMatch(/^ses_/);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end" });
  });

  it("surfaces provider errors from the message info", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      onSendMessage: async () => ({
        info: {
          id: "msg_1",
          sessionID: "ses_abc",
          role: "assistant",
          time: { created: 0, completed: 0 },
          error: {
            name: "ProviderAuthError",
            data: { providerID: "fake", message: "no key" },
          },
        },
        parts: [],
      }),
    });
    server.installGlobal();
    const events = (await drainNdjson(turn(server))) as OpenCodeFrontendEvent[];
    const err = events.find((e) => e.type === "error") as
      { message: string } | undefined;
    expect(err?.message).toMatch(/configure/i);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "error" });
  });

  it("reports unavailable when the server is unreachable", async () => {
    server = new FakeOpenCodeServer({
      onSendMessage: async () => {
        throw new TypeError("fetch failed");
      },
    });
    server.installGlobal();
    const events = (await drainNdjson(
      turn(server, { sessionId: "ses_x" }),
    )) as OpenCodeFrontendEvent[];
    const err = events.find((e) => e.type === "error") as
      { message: string } | undefined;
    expect(err?.message).toMatch(/unreachable|unavailable/i);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "error" });
  });

  it("terminates with Stopped. when the caller signal fires", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 100,
    });
    server.installGlobal();
    eventBus.resetForTests();
    const controller = new AbortController();
    const stream = turn(server, { signal: controller.signal });
    const promise = drainNdjson(stream);
    await new Promise((r) => setTimeout(r, 20));
    controller.abort();
    const events = (await promise) as OpenCodeFrontendEvent[];
    expect(
      events.some((e) => e.type === "notice" && e.message === "Stopped."),
    ).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end" });
    // The turn itself must NOT abort the server on a caller abort — that is
    // the Stop endpoint's job (abortTurn), so page refreshes (which also
    // abort the request) never kill a running turn.
    expect(server.abortCalls).toHaveLength(0);
  });

  it("fails the turn with a retryable message when the idle watchdog fires", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 1_000, // keep the turn open past the idle budget
    });
    server.installGlobal();
    eventBus.resetForTests();
    const cfg: OpenCodeConfig = { ...config, idleMs: 60, firstEventMs: 5_000 };
    const client = new OpenCodeClient({
      config: cfg,
      fetchImpl: server.fetchImpl,
    });
    pushAfterSubscribe({
      type: "message.part.updated",
      properties: {
        part: {
          id: "prt_1",
          sessionID: "ses_abc",
          messageID: "msg_1",
          type: "text",
          text: "partial",
        },
        delta: "partial",
      },
    });
    const events = (await drainNdjson(
      runTurn(client, cfg, {
        chatId: "chat-1",
        sessionId: "ses_abc",
        text: "hello",
        toolsEnabled: true,
      }),
    )) as OpenCodeFrontendEvent[];
    const err = events.find((e) => e.type === "error") as
      { message: string } | undefined;
    expect(err?.message).toMatch(/stopped responding/i);
    expect(server.abortCalls).toContain("ses_abc");
  });

  it("fails fast when no first event arrives", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 1_000, // the POST must not resolve before the watchdog
    });
    server.installGlobal();
    eventBus.resetForTests();
    const cfg: OpenCodeConfig = { ...config, firstEventMs: 60 };
    const client = new OpenCodeClient({
      config: cfg,
      fetchImpl: server.fetchImpl,
    });
    const events = (await drainNdjson(
      runTurn(client, cfg, {
        chatId: "chat-1",
        sessionId: "ses_abc",
        text: "hello",
        toolsEnabled: true,
      }),
    )) as OpenCodeFrontendEvent[];
    const err = events.find((e) => e.type === "error") as
      { message: string } | undefined;
    expect(err?.message).toMatch(/didn't start responding|timed out/i);
  });

  it("attach mode resumes a running turn with a snapshot and no duplicate send", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 400,
      onListMessages: async () => [
        {
          info: {
            id: "msg_1",
            sessionID: "ses_abc",
            role: "assistant",
            time: { created: 0 },
          },
          parts: [
            {
              id: "prt_1",
              sessionID: "ses_abc",
              messageID: "msg_1",
              type: "text",
              text: "already streamed",
            },
            {
              id: "prt_2",
              sessionID: "ses_abc",
              messageID: "msg_1",
              type: "tool",
              callID: "c1",
              tool: "bash",
              state: {
                status: "completed",
                input: {},
                output: "out",
                title: "t",
                metadata: {},
                time: { start: 0, end: 1 },
              },
            },
          ],
        },
      ],
    });
    server.installGlobal();

    const first = drainNdjson(turn(server));
    await new Promise((r) => setTimeout(r, 20));
    const attachEvents = (await drainNdjson(
      turn(server, { resume: true }),
    )) as OpenCodeFrontendEvent[];
    expect(attachEvents[0]).toEqual({ type: "resumed" });
    const types = attachEvents.map((e) => e.type);
    expect(types).toContain("text");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("done");
    expect(attachEvents.filter((e) => e.type === "done").length).toBe(1);
    await first;
  });

  it("attach mode fails cleanly when no turn is running", async () => {
    const events = (await drainNdjson(
      turn(server, { resume: true }),
    )) as OpenCodeFrontendEvent[];
    const err = events.find((e) => e.type === "error") as
      { message: string } | undefined;
    expect(err?.message).toMatch(/no active response/i);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "error" });
  });

  it("keeps running for resume when the consumer cancels the stream (refresh)", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 150,
    });
    server.installGlobal();
    eventBus.resetForTests();

    const stream = turn(server);
    const reader = stream.getReader();
    await reader.read(); // first chunk delivered
    await reader.cancel(); // browser refresh / unmount aborts the fetch

    // The turn must complete server-side without crashing and clean up the
    // registry so a later resume can attach to a fresh turn.
    await sleep(400);
    expect(isSessionActive("ses_abc")).toBe(false);
    expect(server.abortCalls).toHaveLength(0); // no server-side abort on refresh
  });

  it("abortTurn aborts the registry entry and the server", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 300,
    });
    server.installGlobal();
    const promise = drainNdjson(turn(server));
    await new Promise((r) => setTimeout(r, 20));
    const client = new OpenCodeClient({ config, fetchImpl: server.fetchImpl });
    await abortTurn("ses_abc", client);
    const events = (await promise) as OpenCodeFrontendEvent[];
    expect(server.abortCalls).toContain("ses_abc");
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end" });
  });
});
