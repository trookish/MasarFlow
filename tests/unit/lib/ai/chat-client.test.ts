import { describe, it, expect, vi, afterEach } from "vitest";
import { runWorkspaceChat } from "@/lib/ai/chat-client";
import type { AiProvider } from "@/lib/ai/catalog";

/**
 * runWorkspaceChat drives the agentic tool loop. These tests mock /api/chat
 * (NDJSON event streams) to verify the empty-turn recovery ladder: when a
 * thinking model "thinks" about acting but emits no tool_call, the retry must
 * KEEP tools (only drop thinking) so the model still gets to act.
 */

const provider: AiProvider = { id: "openai", name: "Test", models: {} };

function ndjson(events: unknown[]): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      c.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
}

const realFetch = global.fetch;

function mockFetch(responses: unknown[][]) {
  let call = 0;
  const bodies: unknown[] = [];
  global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    const events = responses[call++] ?? [];
    return ndjson(events);
  }) as unknown as typeof global.fetch;
  return bodies;
}

describe("runWorkspaceChat tool execution", () => {
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("executes a tool call emitted on the first round", async () => {
    const bodies = mockFetch([
      [
        { type: "tool_call", id: "t1", name: "create_note", arguments: { title: "hi", body: "x" } },
        { type: "done", stopReason: "tool_calls" },
      ],
      [{ type: "text", text: "Created it." }, { type: "done", stopReason: "end" }],
    ]);
    const executed: string[] = [];
    const result = await runWorkspaceChat({
      provider,
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "create a note" }],
      tools: [{ name: "create_note", description: "x", parameters: {} }],
      executeTool: async (c) => {
        executed.push(c.name);
        return JSON.stringify({ ok: true, id: "n1" });
      },
    });
    expect(executed).toEqual(["create_note"]);
    expect(result.text).toContain("Created it");
    expect(bodies).toHaveLength(2);
  });

  it("retries with tools KEPT (thinking dropped) after an empty thinking turn, then executes the tool", async () => {
    const bodies = mockFetch([
      // Round 0: reasoning only, no text, no tool_call → empty.
      [{ type: "reasoning", text: "Let me use create_note." }, { type: "done", stopReason: "end" }],
      // Round 1 (retry): tools on, thinking off → emits the tool call.
      [
        { type: "tool_call", id: "t1", name: "create_note", arguments: { title: "hello", body: "hello" } },
        { type: "done", stopReason: "tool_calls" },
      ],
      // Round 2: narration.
      [{ type: "text", text: "Done — created the note." }, { type: "done", stopReason: "end" }],
    ]);
    const executed: string[] = [];
    const result = await runWorkspaceChat({
      provider,
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "Create a note titled hello" }],
      tools: [{ name: "create_note", description: "x", parameters: {} }],
      reasoning: { enabled: true, budget: 1000 },
      executeTool: async (c) => {
        executed.push(c.name);
        return JSON.stringify({ ok: true, id: "n1", title: "hello" });
      },
    });

    expect(executed).toEqual(["create_note"]);
    expect(result.text).toContain("Done");
    expect(bodies).toHaveLength(3);
    // The retry (2nd upstream call) must still carry the tools.
    expect((bodies[1] as { tools?: unknown[] }).tools).toBeDefined();
    // ...and must NOT carry reasoning (thinking dropped on the retry).
    expect((bodies[1] as { reasoning?: unknown }).reasoning).toBeUndefined();
  });

  it("falls back to a tool-less text answer after two empty turns", async () => {
    const bodies = mockFetch([
      // Round 0 (thinking on, tools on): empty.
      [{ type: "reasoning", text: "hmm" }, { type: "done", stopReason: "end" }],
      // Round 1 (thinking off, tools on): still empty.
      [{ type: "done", stopReason: "end" }],
      // Round 2 (tools off): text answer.
      [{ type: "text", text: "I can't do that here." }, { type: "done", stopReason: "end" }],
    ]);
    const executed: string[] = [];
    const result = await runWorkspaceChat({
      provider,
      apiKey: "k",
      model: "m",
      messages: [{ role: "user", content: "do a thing" }],
      tools: [{ name: "create_note", description: "x", parameters: {} }],
      reasoning: { enabled: true, budget: 1000 },
      executeTool: async (c) => {
        executed.push(c.name);
        return JSON.stringify({ ok: true });
      },
    });
    expect(executed).toHaveLength(0);
    expect(result.text).toContain("I can't do that here");
    // Round 0 tools on, round 1 tools on, round 2 tools off.
    expect((bodies[0] as { tools?: unknown[] }).tools).toBeDefined();
    expect((bodies[1] as { tools?: unknown[] }).tools).toBeDefined();
    expect((bodies[2] as { tools?: unknown[] }).tools).toBeUndefined();
  });
});
