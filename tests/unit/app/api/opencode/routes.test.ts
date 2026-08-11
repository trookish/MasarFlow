/**
 * API route tests for /api/opencode/* — every route is exercised against the
 * FakeOpenCodeServer (stubbed global fetch), asserting validation, streaming,
 * error classification, and the absence of any secret in responses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as modelsGET } from "@/app/api/opencode/models/route";
import { resetModelsCacheForTests } from "@/app/api/opencode/models/cache";
import { GET as healthGET } from "@/app/api/opencode/health/route";
import { GET as stateGET } from "@/app/api/opencode/state/route";
import { GET as historyGET } from "@/app/api/opencode/history/route";
import {
  POST as sessionPOST,
  DELETE as sessionDELETE,
} from "@/app/api/opencode/session/route";
import { POST as sendPOST } from "@/app/api/opencode/send/route";
import { POST as abortPOST } from "@/app/api/opencode/abort/route";
import { POST as approvalPOST } from "@/app/api/opencode/approval/route";
import { POST as undoPOST } from "@/app/api/opencode/undo/route";
import { POST as wsCallPOST } from "@/app/api/opencode/ws-call/route";
import { POST as wsClaimPOST } from "@/app/api/opencode/ws-call/claim/route";
import { POST as wsResultPOST } from "@/app/api/opencode/ws-call/result/route";
import { GET as toolsGenGET } from "@/app/api/opencode/tools-gen/route";
import { subscribeWorkspaceTools } from "@/lib/opencode/bridge";
import { WORKSPACE_TOOLS } from "@/lib/ai/workspace-tool-defs";

import { FakeOpenCodeServer, drainNdjson } from "../../../lib/opencode/helpers";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/opencode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/opencode routes", () => {
  let server: FakeOpenCodeServer;

  beforeEach(() => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
    });
    server.installGlobal();
  });

  afterEach(async () => {
    await FakeOpenCodeServer.restoreGlobal();
  });

  it("health reports ok and version", async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "1.18.15" });
  });

  it("health reports unavailable without throwing", async () => {
    const failing = (async () =>
      new Response("boom", { status: 500 })) as typeof fetch;
    vi.stubGlobal("fetch", failing);
    const res = await healthGET();
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/unavailable/i);
  });

  it("session POST creates a session and returns its id", async () => {
    const res = await sessionPOST(
      jsonRequest({ threadId: "chat-1", directory: "C:\\proj" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      opencodeSessionId: string;
      created: boolean;
    };
    expect(body.opencodeSessionId).toMatch(/^ses_/);
    expect(body.created).toBe(true);
  });

  it("session POST validates threadId", async () => {
    const res = await sessionPOST(jsonRequest({ threadId: "" }));
    expect(res.status).toBe(400);
  });

  it("session DELETE removes the OpenCode session", async () => {
    const res = await sessionDELETE(
      new Request("http://localhost/api/opencode/session?sessionId=ses_abc"),
    );
    expect(res.status).toBe(200);
    expect(server.deleteCalls).toContain("ses_abc");
  });

  it("state reports busy for a running session", async () => {
    server.sessions.get("ses_abc")!.status = { type: "busy" };
    const res = await stateGET(
      new Request("http://localhost/api/opencode/state?sessionId=ses_abc"),
    );
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("busy");
  });

  it("state reports missing for an unknown session", async () => {
    const res = await stateGET(
      new Request("http://localhost/api/opencode/state?sessionId=ses_gone"),
    );
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("missing");
  });

  it("send streams NDJSON text + done for a normal turn", async () => {
    const res = await sendPOST(
      jsonRequest({
        chatId: "chat-1",
        sessionId: "ses_abc",
        text: "hello",
        toolsEnabled: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await drainNdjson(res.body!)) as { type: string }[];
    expect(events.map((e) => e.type)).toContain("text");
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end" });
  });

  it("send rejects a second concurrent turn on the same session", async () => {
    server = new FakeOpenCodeServer({
      sessions: [
        { id: "ses_abc", directory: "C:\\workspace", status: { type: "idle" } },
      ],
      sendDelayMs: 300,
    });
    server.installGlobal();
    const first = sendPOST(
      jsonRequest({
        chatId: "chat-1",
        sessionId: "ses_abc",
        text: "a",
        toolsEnabled: true,
      }),
    );
    await sleep(20);
    const second = await sendPOST(
      jsonRequest({
        chatId: "chat-1",
        sessionId: "ses_abc",
        text: "b",
        toolsEnabled: true,
      }),
    );
    expect(second.status).toBe(200);
    const events = (await drainNdjson(second.body!)) as {
      type: string;
      message?: string;
    }[];
    expect(
      events.some(
        (e) =>
          e.type === "error" && /already responding/i.test(e.message ?? ""),
      ),
    ).toBe(true);
    await first;
  });

  it("send validates missing text", async () => {
    const res = await sendPOST(jsonRequest({ chatId: "chat-1", text: "  " }));
    expect(res.status).toBe(400);
  });

  it("abort forwards to the server and stops the turn", async () => {
    const res = await abortPOST(jsonRequest({ sessionId: "ses_abc" }));
    expect(res.status).toBe(200);
    expect(server.abortCalls).toContain("ses_abc");
  });

  it("abort validates the session id", async () => {
    const res = await abortPOST(jsonRequest({ sessionId: "nope" }));
    expect(res.status).toBe(400);
  });

  it("approval forwards the permission reply", async () => {
    const res = await approvalPOST(
      jsonRequest({
        sessionId: "ses_abc",
        permissionId: "prm_1",
        response: "once",
      }),
    );
    expect(res.status).toBe(200);
    expect(server.permissionReplies).toHaveLength(1);
    expect(server.permissionReplies[0].response).toBe("once");
  });

  it("approval rejects invalid responses", async () => {
    const res = await approvalPOST(
      jsonRequest({
        sessionId: "ses_abc",
        permissionId: "prm_1",
        response: "maybe",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("undo forwards messageID and partID", async () => {
    const res = await undoPOST(
      jsonRequest({
        sessionId: "ses_abc",
        messageID: "msg_1",
        partID: "prt_9",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("history lists messages", async () => {
    server.sessions.set("ses_abc", {
      id: "ses_abc",
      directory: "C:\\workspace",
      status: { type: "idle" },
    });
    const res = await historyGET(
      new Request(
        "http://localhost/api/opencode/history?sessionId=ses_abc&limit=5",
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[] };
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it("models returns connected providers without any credentials", async () => {
    const res = await modelsGET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: { providerId: string; models: unknown[] }[];
      cached: boolean;
    };
    expect(body.providers[0].providerId).toBe("fake");
    expect(body.cached).toBe(false);
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/key|token|secret|authorization/i);
  });

  it("models degrades to an error response when OpenCode is down", async () => {
    resetModelsCacheForTests();
    vi.stubGlobal("fetch", (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    const res = await modelsGET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unavailable|unreachable/i);
    resetModelsCacheForTests();
  });
});

describe("/api/opencode workspace-tool bridge routes", () => {
  const SECRET = "test-bridge-secret";
  const SESSION = "ses_abc";

  function bridgeRequest(body: unknown, secret = SECRET): Request {
    return new Request("http://localhost/api/opencode/ws-call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-masarflow-bridge-secret": secret,
      },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.stubEnv("MASARFLOW_BRIDGE_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects calls without a configured or matching secret", async () => {
    vi.unstubAllEnvs();
    const noSecret = await wsCallPOST(
      bridgeRequest({ sessionId: SESSION, name: "create_note", args: {} }),
    );
    expect(noSecret.status).toBe(503);

    vi.stubEnv("MASARFLOW_BRIDGE_SECRET", SECRET);
    const badSecret = await wsCallPOST(
      bridgeRequest(
        { sessionId: SESSION, name: "create_note", args: {} },
        "wrong",
      ),
    );
    expect(badSecret.status).toBe(401);
  });

  it("rejects missing session ids and unknown tool names", async () => {
    expect(
      (await wsCallPOST(bridgeRequest({ name: "create_note", args: {} })))
        .status,
    ).toBe(400);
    expect(
      (
        await wsCallPOST(
          bridgeRequest({ sessionId: SESSION, name: "not_a_tool", args: {} }),
        )
      ).status,
    ).toBe(400);
  });

  it("round-trips a tool call end to end: ws-call → claim → result", async () => {
    let captured: {
      correlationId: string;
      name: string;
      sessionId: string;
      args: Record<string, unknown>;
    } | null = null;
    const unsubscribe = subscribeWorkspaceTools((call) => {
      if (!captured) captured = call;
    });

    const callPromise = wsCallPOST(
      bridgeRequest({
        sessionId: SESSION,
        name: "create_note",
        args: { title: "T" },
      }),
    );

    // The browser receives the pending call over the SSE subscriber…
    await vi.waitFor(() => {
      expect(captured).not.toBeNull();
    });
    expect(captured!.name).toBe("create_note");
    expect(captured!.args).toEqual({ title: "T" });
    unsubscribe();

    // …claims it exactly once…
    const claim1 = await wsClaimPOST(
      jsonRequest({
        correlationId: captured!.correlationId,
        sessionId: SESSION,
      }),
    );
    expect(await claim1.json()).toMatchObject({ ok: true, claimed: true });
    const claim2 = await wsClaimPOST(
      jsonRequest({
        correlationId: captured!.correlationId,
        sessionId: SESSION,
      }),
    );
    expect(await claim2.json()).toMatchObject({ ok: true, claimed: false });

    // …executes it, and posts the result back, unblocking the opencode tool.
    const resultRes = await wsResultPOST(
      jsonRequest({
        correlationId: captured!.correlationId,
        sessionId: SESSION,
        result: '{"ok":true,"id":"note-1"}',
      }),
    );
    expect(resultRes.status).toBe(200);

    const callRes = await callPromise;
    expect(callRes.status).toBe(200);
    expect(await callRes.json()).toEqual({
      ok: true,
      result: '{"ok":true,"id":"note-1"}',
    });
  });

  it("rejects results from the wrong session", async () => {
    let captured: { correlationId: string } | null = null;
    const unsubscribe = subscribeWorkspaceTools((call) => {
      if (!captured) captured = call;
    });
    const callPromise = wsCallPOST(
      bridgeRequest({ sessionId: SESSION, name: "create_note", args: {} }),
    );
    await vi.waitFor(() => expect(captured).not.toBeNull());
    unsubscribe();

    const res = await wsResultPOST(
      jsonRequest({
        correlationId: captured!.correlationId,
        sessionId: "ses_other",
        result: "{}",
      }),
    );
    expect(res.status).toBe(404);
    // Resolve the call cleanly with the correct session so no timer lingers.
    await wsResultPOST(
      jsonRequest({
        correlationId: captured!.correlationId,
        sessionId: SESSION,
        result: "{}",
      }),
    );
    await callPromise;
  });

  it("reports browser-side execution failures to the pending call", async () => {
    let captured: { correlationId: string } | null = null;
    const unsubscribe = subscribeWorkspaceTools((call) => {
      if (!captured) captured = call;
    });
    const callPromise = wsCallPOST(
      bridgeRequest({ sessionId: SESSION, name: "create_note", args: {} }),
    );
    await vi.waitFor(() => expect(captured).not.toBeNull());
    unsubscribe();

    const res = await wsResultPOST(
      jsonRequest({
        correlationId: captured!.correlationId,
        sessionId: SESSION,
        error: "IndexedDB exploded",
      }),
    );
    expect(res.status).toBe(200);
    const callRes = await callPromise;
    expect(callRes.status).toBe(504);
    expect(await callRes.json()).toMatchObject({ error: /IndexedDB exploded/ });
  });

  it("tools-gen requires the secret and serves every workspace function", async () => {
    const unauthorized = await toolsGenGET(
      new Request("http://localhost/api/opencode/tools-gen"),
    );
    expect(unauthorized.status).toBe(401);

    const res = await toolsGenGET(
      new Request(`http://localhost/api/opencode/tools-gen?secret=${SECRET}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      files: { name: string; content: string }[];
      toolNames: string[];
    };
    expect(body.files).toHaveLength(WORKSPACE_TOOLS.length);
    expect(body.toolNames).toContain("create_note");
    expect(body.files[0].content).toContain(
      'import { tool } from "@opencode-ai/plugin"',
    );
  });
});
