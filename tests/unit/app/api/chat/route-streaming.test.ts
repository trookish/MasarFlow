import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "@/app/api/chat/route";

/**
 * Reproduction harness for the "stream stops suddenly / no response at all"
 * chat bug. Feeds realistic provider SSE streams through the real POST
 * handler with a stubbed upstream fetch and inspects the NDJSON output.
 *
 * Failure modes under test:
 *  1. Anthropic extended-thinking stream (thinking → tool_use) must pass through.
 *  2. OpenAI-compatible reasoning stream (Kimi/DeepSeek `reasoning_content`)
 *     must pass through.
 *  3. Upstream stalls MID-STREAM (emits reasoning, then silence, never
 *     closes) — the route must not hang forever; it must terminate the turn
 *     with a visible error event.
 *  4. Upstream stalls BEFORE THE FIRST BYTE — same requirement.
 *  5. SSE events whose JSON payload is split across multiple `data:` lines
 *     (spec-conformant) must be reassembled, not dropped.
 */

function body(overrides: Record<string, unknown> = {}) {
  return {
    format: "openai",
    baseUrl: "https://example.com/v1",
    apiKey: "sk-test",
    model: "test-model",
    messages: [{ role: "user", content: "hi" }],
    ...overrides,
  };
}

function req(b: Record<string, unknown>) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b),
  });
}

/** A Response whose body is a hand-driven ReadableStream of SSE text chunks. */
function manualSseResponse() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    res: new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    push(chunk: string) {
      controller.enqueue(encoder.encode(chunk));
    },
    close() {
      controller.close();
    },
  };
}

/** Read an NDJSON response body into parsed events (assumes it terminates). */
async function readEvents(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** Race a promise against a timeout; resolves `null` when the timeout wins. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((r) => setTimeout(() => r(null), ms)),
  ]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("chat route — provider stream robustness", () => {
  it("passes through an Anthropic thinking + tool_use stream", async () => {
    const sse =
      'data: {"type":"message_start","message":{"id":"m1"}}\n\n' +
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n' +
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"The user wants a summary"}}\n\n' +
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig"}}\n\n' +
      'data: {"type":"content_block_stop","index":0}\n\n' +
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"list_tasks","input":{}}}\n\n' +
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"status\\":\\"todo\\"}"}}\n\n' +
      'data: {"type":"content_block_stop","index":1}\n\n' +
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n' +
      'data: {"type":"message_stop"}\n\n';
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );
    const res = await POST(req(body({ format: "anthropic" })));
    const events = await withTimeout(readEvents(res), 3000);
    expect(events).not.toBeNull();
    expect(events).toContainEqual({
      type: "reasoning",
      text: "The user wants a summary",
    });
    expect(events).toContainEqual({
      type: "tool_call",
      id: "toolu_1",
      name: "list_tasks",
      arguments: { status: "todo" },
    });
    expect(events!.at(-1)).toEqual({ type: "done", stopReason: "tool_calls" });
  });

  it("passes through an OpenAI reasoning_content stream", async () => {
    const sse =
      'data: {"choices":[{"delta":{"reasoning_content":"The user wants"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{"reasoning_content":" a summary"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"Here is the summary."},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
      "data: [DONE]\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );
    const res = await POST(req(body()));
    const events = await withTimeout(readEvents(res), 3000);
    expect(events).not.toBeNull();
    const reasoning = events!
      .filter((e) => e.type === "reasoning")
      .map((e) => e.text)
      .join("");
    expect(reasoning).toBe("The user wants a summary");
    expect(events).toContainEqual({
      type: "text",
      text: "Here is the summary.",
    });
    expect(events!.at(-1)).toEqual({ type: "done", stopReason: "end" });
  });

  it("does not hang forever when the upstream stalls mid-stream", async () => {
    const upstream = manualSseResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => upstream.res),
    );
    const res = await POST(req(body()));
    upstream.push(
      'data: {"choices":[{"delta":{"reasoning_content":"The user wants a summary"},"finish_reason":null}]}\n\n',
    );
    // …then the provider goes silent forever (socket held open, no data).
    const events = await withTimeout(readEvents(res), 90_000);
    expect(events).not.toBeNull(); // must terminate well before 90s
    expect(events!.some((e) => e.type === "error" || e.type === "notice")).toBe(
      true,
    );
  }, 100_000);

  it("does not hang forever when the upstream never sends a byte", async () => {
    const upstream = manualSseResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => upstream.res),
    );
    const res = await POST(req(body()));
    const events = await withTimeout(readEvents(res), 90_000);
    expect(events).not.toBeNull();
    expect(events!.some((e) => e.type === "error" || e.type === "notice")).toBe(
      true,
    );
  }, 100_000);

  it("reassembles SSE payloads split across multiple data: lines", async () => {
    // Spec-conformant SSE: one event may carry several data: lines which the
    // client must join with "\n". Gateways that chunk at buffer boundaries
    // produce exactly this.
    const payload = JSON.stringify({
      choices: [{ delta: { content: "hello world" }, finish_reason: null }],
    });
    const half = Math.floor(payload.length / 2);
    const sse =
      `data: ${payload.slice(0, half)}\n` +
      `data: ${payload.slice(half)}\n\n` +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
      "data: [DONE]\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );
    const res = await POST(req(body()));
    const events = await withTimeout(readEvents(res), 3000);
    expect(events).not.toBeNull();
    expect(events).toContainEqual({ type: "text", text: "hello world" });
  });

  it("keeps parallel tool calls' arguments separate even when index is omitted", async () => {
    // Some gateways omit `index` and send the call id only on the first
    // chunk. Every argument delta must land on ITS call — the old keying by
    // `index ?? 0` corrupted the first call's arguments and emptied the
    // second. (The chunks here deliberately interleave the two calls.)
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_a","type":"function","function":{"name":"tool_a","arguments":""}}]},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_b","type":"function","function":{"name":"tool_b","arguments":""}}]},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_a","function":{"arguments":"{\\"x\\":"}}]},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_b","function":{"arguments":"{\\"y\\":1}"}}]},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_a","function":{"arguments":"1}"}}]},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      "data: [DONE]\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(sse, {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          }),
      ),
    );
    const res = await POST(req(body()));
    const events = await withTimeout(readEvents(res), 3000);
    expect(events).not.toBeNull();
    expect(events).toContainEqual({
      type: "tool_call",
      id: "call_a",
      name: "tool_a",
      arguments: { x: 1 },
    });
    expect(events).toContainEqual({
      type: "tool_call",
      id: "call_b",
      name: "tool_b",
      arguments: { y: 1 },
    });
    expect(events!.at(-1)).toEqual({ type: "done", stopReason: "tool_calls" });
  });

  it("fails fast with a JSON 504 when the upstream never answers the first byte", async () => {
    // A gateway that accepts the request but never sends a byte: each attempt
    // aborts after the first-byte timeout, one transient retry runs, then the
    // route must answer with a definitive JSON error — never a hanging stream.
    vi.stubEnv("MASARFLOW_CHAT_FIRST_BYTE_TIMEOUT_MS", "1000");
    vi.stubEnv("MASARFLOW_CHAT_TOTAL_TIMEOUT_MS", "10000");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const started = Date.now();
    const res = await POST(req(body()));
    const elapsed = Date.now() - started;
    expect(res.status).toBe(504);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/didn't respond within 1s/);
    // 2 attempts × ~1s first-byte + backoff — must be well under 10s.
    expect(elapsed).toBeLessThan(10_000);
  });

  it("surfaces the provider's error message and status on a hard failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: "model 'nope' does not exist" },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const res = await POST(req(body({ model: "nope" })));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/does not exist/);
  });

  it("stops retrying after the transient budget is exhausted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const res = await POST(req(body()));
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/Could not reach provider/);
    // MAX_TRANSIENT_RETRIES = 1 → exactly two attempts, no infinite loop.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
});
