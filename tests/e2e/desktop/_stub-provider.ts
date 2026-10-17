/**
 * Minimal OpenAI-compatible stub provider for the packaged chat specs (P9.T10).
 *
 * Why a stub and not a real provider: the packaged e2e run must stay offline
 * and deterministic (see _harness.ts). A saved connection pointing at this
 * server exercises the REAL wire end to end — ChatView → the in-browser Agent
 * Loop → /api/chat → the provider fetch — while every request body the app
 * actually sent is captured here, so a spec can assert on the workspace
 * briefing and the tool definitions rather than on a mock.
 *
 * Binding rules (task brief): 127.0.0.1 only, random port (0), and every stub
 * is closed — specs call `stopAllStubs()` from `test.afterAll`, individual
 * tests may also `stop()` their own.
 *
 * The reply is deterministic: `STUB-REPLY <last user message>`, streamed as
 * OpenAI SSE chunks with a stop finish_reason.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface StubCall {
  method: string;
  /** Path only (no query string). */
  path: string;
  /** Parsed JSON body when the request carried one, else {}. */
  body: Record<string, unknown>;
}

export interface StubProvider {
  /** The OpenAI-compatible base URL to save in a connection: http://127.0.0.1:<port>/v1 */
  baseUrl: string;
  port: number;
  /** Every request the stub has received, in arrival order. */
  calls: StubCall[];
  /** Captured /chat/completions payloads, in arrival order. */
  chatBodies(): Record<string, unknown>[];
  /** Stops this stub (idempotent). */
  stop(): Promise<void>;
}

/** Every stub that is still listening, so afterAll can close them all. */
const live = new Set<Server>();

/** The last `role: "user"` message's text — what the stub echoes back. */
function lastUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: unknown } | null;
    if (!m || m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return (m.content as { text?: unknown }[])
        .map((p) => (typeof p?.text === "string" ? p.text : ""))
        .join(" ")
        .trim();
    }
    return "";
  }
  return "";
}

export async function startStubProvider(): Promise<StubProvider> {
  const calls: StubCall[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("error", () => {
      /* client aborted mid-request — nothing to do */
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: Record<string, unknown> = {};
      if (raw) {
        try {
          body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          body = {};
        }
      }
      const path = (req.url ?? "").split("?")[0];
      calls.push({ method: req.method ?? "GET", path, body });

      if (!path.endsWith("/chat/completions")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: `stub provider: no route ${path}` } }));
        return;
      }

      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      const reply = `STUB-REPLY ${lastUserText(body.messages)}`.trim();
      const id = `chatcmpl-stub-${calls.length}`;
      const chunk = (
        delta: Record<string, unknown>,
        finish: string | null = null,
      ): string =>
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created: 0,
          model: typeof body.model === "string" ? body.model : "stub-model",
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`;
      // Two content deltas so the client's SSE parser is exercised, then stop.
      const cut = Math.ceil(reply.length / 2);
      res.write(chunk({ role: "assistant", content: reply.slice(0, cut) }));
      res.write(chunk({ content: reply.slice(cut) }));
      res.write(chunk({}, "stop"));
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  // A request aborted by the app (Stop, navigation) must not crash the spec's
  // Node process — mirror the app's own proxy hardening (commit 337dc6d).
  server.on("clientError", (_err, socket) => socket.destroy());

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  live.add(server);
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    port,
    calls,
    chatBodies: () =>
      calls.filter((c) => c.path.endsWith("/chat/completions")).map((c) => c.body),
    stop: async () => {
      if (!live.delete(server)) return;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Closes every stub still listening — call from `test.afterAll` in the spec. */
export async function stopAllStubs(): Promise<void> {
  for (const server of [...live]) {
    live.delete(server);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/**
 * Polls `check` until it returns true — for spec-side waiting on captured
 * requests without arbitrary sleeps. Throws after `timeoutMs`.
 */
export async function waitFor(
  check: () => boolean,
  timeoutMs = 15_000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
}
