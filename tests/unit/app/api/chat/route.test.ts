import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/chat/route";

/** Minimal ChatRequest body for the OpenAI wire format. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    format: "openai",
    baseUrl: "https://example.com/v1",
    apiKey: "sk-test",
    model: "test-model",
    messages: [{ role: "user", content: "hi" }],
    tools: [
      {
        name: "do_thing",
        description: "Does a thing.",
        parameters: {
          type: "object",
          properties: { x: { type: "string" } },
        },
      },
    ],
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

const SSE_TEXT =
  'data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n' +
  "data: [DONE]\n\n";

function sseResponse(payload = SSE_TEXT) {
  return new Response(payload, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Grab the parsed JSON payload of fetch call n. */
function payloadOf(call: number) {
  const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[call][1];
  return JSON.parse(String(init?.body));
}

describe("api/chat route", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse()),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends tools with explicit tool_choice auto by default", async () => {
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    const payload = payloadOf(0);
    expect(payload.tools).toEqual([
      {
        type: "function",
        function: {
          name: "do_thing",
          description: "Does a thing.",
          parameters: {
            type: "object",
            properties: { x: { type: "string" } },
          },
        },
      },
    ]);
    expect(payload.tool_choice).toBe("auto");
  });

  it("passes tool_choice required through on the OpenAI format", async () => {
    await POST(req(body({ toolChoice: "required" })));
    expect(payloadOf(0).tool_choice).toBe("required");
  });

  it("maps tool_choice required to {type:any} on the Anthropic format", async () => {
    await POST(req(body({ format: "anthropic", toolChoice: "required" })));
    const payload = payloadOf(0);
    expect(payload.tool_choice).toEqual({ type: "any" });
    expect(payload.tools).toEqual([
      {
        name: "do_thing",
        description: "Does a thing.",
        input_schema: {
          type: "object",
          properties: { x: { type: "string" } },
        },
      },
    ]);
  });

  it("omits tool_choice when no tools are provided", async () => {
    await POST(req(body({ tools: undefined })));
    expect(payloadOf(0).tool_choice).toBeUndefined();
  });

  it("degrades to a tool-less retry with a notice when tools are rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: { message: "tools are not supported by this model" },
            }),
            { status: 400 },
          ),
        )
        .mockResolvedValueOnce(sseResponse()),
    );
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    // Second attempt must not carry tools.
    expect(payloadOf(1).tools).toBeUndefined();
    expect(payloadOf(1).tool_choice).toBeUndefined();
    const text = await res.text();
    const events = text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(
      events.some(
        (e) => e.type === "notice" && /function calling/i.test(e.message),
      ),
    ).toBe(true);
    expect(events.some((e) => e.type === "text" && e.text === "hi")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "end" });
  });

  it("streams a tool_call event from OpenAI tool-call deltas", async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"do_thing","arguments":"{\\"x\\":"}}]},"finish_reason":null}]}\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a\\"}"}}]},"finish_reason":null}]}\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n' +
      "data: [DONE]\n\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse(sse)),
    );
    const res = await POST(req(body()));
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(events).toContainEqual({
      type: "tool_call",
      id: "call_1",
      name: "do_thing",
      arguments: { x: "a" },
    });
    expect(events.at(-1)).toEqual({ type: "done", stopReason: "tool_calls" });
  });
});
