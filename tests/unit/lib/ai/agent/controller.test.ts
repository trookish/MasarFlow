import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentController } from "@/lib/ai/agent/controller";
import {
  DEFAULT_AGENT_CONFIG,
  type AgentRunOptions,
  type AgentStreamEvent,
  type LLMProvider,
  type ProviderTurnOptions,
  type ProviderTurnResult,
  type ProviderStreamEvent,
} from "@/lib/ai/agent/types";
import type { ToolCallRequest, WorkspaceToolDef } from "@/lib/ai/tools";

/**
 * The Agent Loop, driven with a scripted fake provider — no network, no
 * IndexedDB. Covers: multi-round tool calling, streaming deltas, cancellation
 * (including the approval-hang deadlock), safety limits, tool failure
 * recovery, argument validation, and the empty-turn ladder.
 */

interface ScriptedTurn {
  text?: string;
  reasoning?: string;
  toolCalls?: ToolCallRequest[];
  throwError?: string;
}

class ScriptedProvider implements LLMProvider {
  calls: ProviderTurnOptions[] = [];
  turns: ScriptedTurn[] = [];
  generate = vi.fn(
    async (
      opts: ProviderTurnOptions,
      onEvent: (event: ProviderStreamEvent) => void,
    ): Promise<ProviderTurnResult> => {
      // Snapshot the message list so later assertions see what the model
      // actually received on THIS call (the controller mutates the array).
      this.calls.push({ ...opts, messages: [...opts.messages] });
      const turn: ScriptedTurn = this.turns.shift() ?? {
        text: "fallback answer",
      };
      if (turn.throwError) throw new Error(turn.throwError);
      if (turn.reasoning) onEvent({ type: "thinking", text: turn.reasoning });
      if (turn.text) onEvent({ type: "message_delta", delta: turn.text });
      for (const tc of turn.toolCalls ?? []) {
        onEvent({
          type: "tool_call",
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        });
      }
      return {
        text: turn.text ?? "",
        reasoning: turn.reasoning ?? "",
        toolCalls: turn.toolCalls ?? [],
        stopReason: turn.toolCalls?.length ? "tool_calls" : "end",
      };
    },
  );
}

const ECHO_TOOL: WorkspaceToolDef = {
  name: "echo",
  description: "Echo a value.",
  parameters: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
  },
};

const SHELL_TOOL: WorkspaceToolDef = {
  name: "shell_run",
  description: "Run a command.",
  parameters: {
    type: "object",
    properties: { command: { type: "string" } },
    required: ["command"],
  },
};

const WRITE_TOOL: WorkspaceToolDef = {
  name: "fs_write",
  description: "Write a file.",
  parameters: {
    type: "object",
    properties: { path: { type: "string" }, content: { type: "string" } },
    required: ["path", "content"],
  },
};

function makeOptions(overrides: Partial<AgentRunOptions> = {}): {
  opts: AgentRunOptions;
  provider: ScriptedProvider;
  events: AgentStreamEvent[];
  controller: AbortController;
  executed: { name: string; args: Record<string, unknown> }[];
} {
  const provider = new ScriptedProvider();
  const controller = new AbortController();
  const events: AgentStreamEvent[] = [];
  const executed: { name: string; args: Record<string, unknown> }[] = [];
  const opts: AgentRunOptions = {
    requestId: "req_test",
    threadId: "t1",
    provider,
    providerMeta: { id: "openai", name: "OpenAI" },
    apiKey: "sk-test",
    model: "test-model",
    messages: [{ role: "user", content: "hi" }],
    tools: [ECHO_TOOL, SHELL_TOOL, WRITE_TOOL],
    executeTool: vi.fn(async (call: ToolCallRequest) => {
      executed.push({ name: call.name, args: call.arguments });
      return JSON.stringify({ ok: true, result: call.arguments.value ?? "ok" });
    }),
    config: DEFAULT_AGENT_CONFIG,
    signal: controller.signal,
    onEvent: (e) => events.push(e),
    ...overrides,
  };
  return { opts, provider, events, controller, executed };
}

/** Concatenate every streamed delta into the visible response. */
function streamedText(events: AgentStreamEvent[]): string {
  return events
    .filter(
      (e): e is { type: "message_delta"; delta: string } =>
        e.type === "message_delta",
    )
    .map((e) => e.delta)
    .join("");
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("AgentController — the agent loop", () => {
  it("streams text for a plain question and completes", async () => {
    const { opts, provider, events } = makeOptions();
    provider.turns.push({ text: "Hello there!" });

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("completed");
    expect(result.text).toBe("Hello there!");
    expect(streamedText(events)).toBe("Hello there!");
    expect(events[0]).toEqual({ type: "agent_started", requestId: "req_test" });
    expect(events).toContainEqual({ type: "message_started" });
    expect(events).toContainEqual({
      type: "message_delta",
      delta: "Hello there!",
    });
    expect(events).toContainEqual({ type: "message_complete" });
    expect(events).toContainEqual({ type: "agent_completed", iterations: 1 });
    expect(result.iterations).toBe(1);
  });

  it("runs tool call → tool result → final answer in one agent execution", async () => {
    const { opts, provider, events, executed } = makeOptions();
    provider.turns.push(
      {
        text: "Let me check.",
        toolCalls: [{ id: "t1", name: "echo", arguments: { value: "ping" } }],
      },
      { text: "Done!" },
    );

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("completed");
    expect(result.iterations).toBe(2);
    expect(executed).toEqual([{ name: "echo", args: { value: "ping" } }]);
    // The stream stayed alive across the tool call: tool_call → tool_result →
    // more deltas → terminal events, with no gap.
    const types = events.map((e) => e.type);
    expect(types.indexOf("tool_call")).toBeGreaterThan(-1);
    expect(types.indexOf("tool_result")).toBeGreaterThan(
      types.indexOf("tool_call"),
    );
    // The final answer's deltas stream AFTER the tool result — the stream
    // stays alive across tool execution.
    expect(types.lastIndexOf("message_delta")).toBeGreaterThan(
      types.indexOf("tool_result"),
    );
    expect(types.at(-1)).toBe("agent_completed");
    // The tool result was handed back to the model in the next turn's messages.
    const secondCall = provider.calls[1];
    expect(secondCall.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "t1",
      name: "echo",
    });
    // Multi-round text is joined with a blank line.
    expect(result.text).toBe("Let me check.\n\nDone!");
  });

  it("accumulates reasoning events separately from text", async () => {
    const { opts, provider, events } = makeOptions();
    provider.turns.push({ reasoning: "Hmm, let me think", text: "Answer." });

    const result = await new AgentController().run(opts);

    expect(result.reasoning).toBe("Hmm, let me think");
    expect(result.text).toBe("Answer.");
    expect(events).toContainEqual({
      type: "thinking",
      text: "Hmm, let me think",
    });
  });

  it("returns tool errors to the model so it can recover", async () => {
    const { opts, provider, executed } = makeOptions();
    provider.turns.push(
      { toolCalls: [{ id: "t1", name: "echo", arguments: { value: "x" } }] },
      { toolCalls: [{ id: "t2", name: "echo", arguments: { value: "y" } }] },
      { text: "Recovered after retrying." },
    );
    // First execution fails, second succeeds.
    let n = 0;
    opts.executeTool = async (call: ToolCallRequest) => {
      executed.push({ name: call.name, args: call.arguments });
      return n++ === 0
        ? JSON.stringify({ ok: false, error: "exploded" })
        : JSON.stringify({ ok: true, result: "ok" });
    };

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("completed");
    expect(result.executed.length).toBe(2);
    expect(result.executed[0].result).toContain("exploded");
    // The model saw the failure before its retry.
    expect(provider.calls[1].messages.at(-1)).toMatchObject({
      role: "tool",
      content: expect.stringContaining("exploded"),
    });
  });

  it("cancels promptly even while a tool call is hanging (approval deadlock fix)", async () => {
    const { opts, provider, controller } = makeOptions();
    provider.turns.push({
      toolCalls: [{ id: "t1", name: "echo", arguments: { value: "x" } }],
    });
    // The host's tool never resolves (e.g. an approval nobody settles).
    opts.executeTool = () => new Promise<string>(() => {});

    const runPromise = new AgentController().run(opts);
    setTimeout(() => controller.abort(), 20);
    const result = await runPromise;

    expect(result.status).toBe("cancelled");
  });

  it("cancels immediately when the signal is already aborted", async () => {
    const { opts, provider, controller } = makeOptions();
    provider.turns.push({ text: "never seen" });
    controller.abort();

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("cancelled");
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("surfaces a provider failure as agent_error with the message", async () => {
    const { opts, provider, events } = makeOptions();
    provider.turns.push({ throwError: "Provider exploded" });

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("error");
    expect(result.error).toBe("Provider exploded");
    expect(events).toContainEqual({
      type: "agent_error",
      message: "Provider exploded",
      recoverable: true,
    });
  });

  it("stops at the iteration limit with an explanatory error", async () => {
    const { opts, provider, events } = makeOptions();
    opts.config = { ...DEFAULT_AGENT_CONFIG, maxIterations: 3 };
    // The model never stops calling tools.
    for (let i = 0; i < 5; i++) {
      provider.turns.push({
        toolCalls: [{ id: `t${i}`, name: "echo", arguments: { value: "x" } }],
      });
    }

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("error");
    expect(result.iterations).toBe(3);
    expect(result.error).toContain("3 rounds");
    expect(events.at(-1)).toMatchObject({
      type: "agent_error",
      recoverable: false,
    });
  });

  it("stops at the wall-clock limit", async () => {
    const { opts, provider } = makeOptions();
    opts.config = { ...DEFAULT_AGENT_CONFIG, maxRunMs: 30 };
    provider.turns.push({
      toolCalls: [{ id: "t1", name: "echo", arguments: { value: "x" } }],
    });
    // A slow provider: the first turn takes longer than the whole run budget,
    // so the next iteration's budget check trips.
    const original = provider.generate;
    provider.generate = vi.fn(async (o, onEvent) => {
      await new Promise((r) => setTimeout(r, 40));
      return original.getMockImplementation()!(o, onEvent);
    });

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("error");
    expect(result.error).toContain("time limit");
  });

  it("enforces the shell-command limit and stops the agent", async () => {
    const { opts, provider, events } = makeOptions();
    opts.config = { ...DEFAULT_AGENT_CONFIG, maxShellCommands: 1 };
    provider.turns.push(
      {
        toolCalls: [
          { id: "t1", name: "shell_run", arguments: { command: "npm test" } },
        ],
      },
      {
        toolCalls: [
          { id: "t2", name: "shell_run", arguments: { command: "npm build" } },
        ],
      },
    );
    opts.executeTool = async (call: ToolCallRequest) =>
      JSON.stringify({
        ok: true,
        result: "ran " + String(call.arguments.command),
      });

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("error");
    expect(result.error).toContain("Shell-command limit");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "agent_error", recoverable: false }),
    );
  });

  it("enforces the file-modification limit", async () => {
    const { opts, provider } = makeOptions();
    opts.config = { ...DEFAULT_AGENT_CONFIG, maxFileModifications: 0 };
    provider.turns.push({
      toolCalls: [
        {
          id: "t1",
          name: "fs_write",
          arguments: { path: "a.txt", content: "x" },
        },
      ],
    });

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("error");
    expect(result.error).toContain("File-modification limit");
  });

  it("times out a stuck tool and hands the timeout error back to the model", async () => {
    const { opts, provider } = makeOptions();
    opts.config = { ...DEFAULT_AGENT_CONFIG, maxToolMs: 30 };
    provider.turns.push(
      { toolCalls: [{ id: "t1", name: "echo", arguments: { value: "x" } }] },
      { text: "The tool timed out; I'll describe it instead." },
    );
    opts.executeTool = () => new Promise<string>(() => {});

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("completed");
    expect(result.executed[0].result).toContain("timed out");
    expect(result.text).toContain("describe it instead");
  });

  it("rejects malformed tool arguments without executing the tool", async () => {
    const { opts, provider, executed } = makeOptions();
    provider.turns.push(
      { toolCalls: [{ id: "t1", name: "echo", arguments: {} }] },
      { text: "Missing the value argument." },
    );

    const result = await new AgentController().run(opts);

    expect(executed.length).toBe(0);
    expect(result.status).toBe("completed");
    // The model was told why the call failed.
    expect(provider.calls[1].messages.at(-1)).toMatchObject({
      role: "tool",
      content: expect.stringContaining("Missing required argument"),
    });
  });

  it("retries an empty thinking turn without tools (empty-turn ladder)", async () => {
    const { opts, provider, events } = makeOptions();
    opts.reasoning = { enabled: true, budget: 1000 };
    provider.turns.push(
      { text: "" }, // thinking-only round: nothing emitted
      { text: "Here is the answer." },
    );

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("completed");
    expect(result.text).toBe("Here is the answer.");
    // Stage 1 of the ladder: the retried round dropped extended thinking
    // (the model already spent its turn reasoning) but kept tools.
    expect(provider.calls[1].reasoning).toBeUndefined();
    expect(provider.calls[1].tools?.length).toBeGreaterThan(0);
    expect(events).toContainEqual({ type: "agent_completed", iterations: 2 });
  });

  it("keeps the conversation message list intact across rounds", async () => {
    const { opts, provider } = makeOptions();
    provider.turns.push(
      {
        text: "Searching…",
        toolCalls: [{ id: "t1", name: "echo", arguments: { value: "a" } }],
      },
      { text: "Final." },
    );

    const result = await new AgentController().run(opts);

    expect(result.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    expect(result.messages[1]).toMatchObject({
      role: "assistant",
      content: "Searching…",
      toolCalls: [{ id: "t1", name: "echo" }],
    });
  });

  it("emits tool_call events while streaming (UI chips during generation)", async () => {
    const { opts, provider, events } = makeOptions();
    provider.turns.push({
      toolCalls: [{ id: "t1", name: "echo", arguments: { value: "ping" } }],
    });
    provider.turns.push({ text: "ok" });

    await new AgentController().run(opts);

    expect(events).toContainEqual({
      type: "tool_call",
      id: "t1",
      name: "echo",
      arguments: { value: "ping" },
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        id: "t1",
        name: "echo",
        ok: true,
      }),
    );
  });

  it("nudges a silent round after tools so the turn always finishes with an answer", async () => {
    // The model used a tool, then went silent (a thinking-model failure
    // mode). The controller must nudge it instead of returning a half-finished
    // turn — the "used tools but stopped" bug.
    const { opts, provider } = makeOptions();
    provider.turns.push(
      { toolCalls: [{ id: "t1", name: "echo", arguments: { value: "x" } }] },
      { text: "" }, // silent after tools
      { text: "" }, // silent again
      { text: "Here is the final answer." },
    );

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("completed");
    expect(result.text).toBe("Here is the final answer.");
    expect(result.iterations).toBe(4);
  });

  it("keeps tools available on the first silent-round nudge, strips them on the second", async () => {
    // First nudge keeps tools (the model may want one more call); if it stays
    // silent, the second nudge strips tools so it must write the answer.
    const { opts, provider, executed } = makeOptions();
    provider.turns.push(
      { toolCalls: [{ id: "t1", name: "echo", arguments: { value: "a" } }] },
      { text: "" }, // silent → nudge 1, tools on
      { toolCalls: [{ id: "t2", name: "echo", arguments: { value: "b" } }] },
      { text: "" }, // silent → nudge 2, tools off
      { text: "Done." },
    );

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("completed");
    expect(executed.map((e) => e.args.value)).toEqual(["a", "b"]);
    expect(result.iterations).toBe(5);
  });

  it("gives a totally silent model a bounded number of chances then stops cleanly", async () => {
    const { opts, provider } = makeOptions();
    for (let i = 0; i < 8; i++) provider.turns.push({ text: "" });

    const result = await new AgentController().run(opts);

    // Stage B + 2 nudges = 4 attempts, then the loop completes (empty) and
    // the host surfaces the "empty response" error.
    expect(result.status).toBe("completed");
    expect(result.text).toBe("");
    expect(result.iterations).toBeLessThanOrEqual(6);
  });

  it("trims conversation history to fit a small context window", async () => {
    const { opts, provider, events } = makeOptions();
    opts.contextLimit = 1500;
    opts.messages = [
      { role: "user", content: "turn 1 " + "x".repeat(1500) },
      { role: "assistant", content: "answer 1 " + "y".repeat(1500) },
      { role: "user", content: "turn 2 " + "z".repeat(1500) },
      { role: "assistant", content: "answer 2 " + "w".repeat(1500) },
      { role: "user", content: "what now?" },
    ];
    provider.turns.push({ text: "Answer." });

    const result = await new AgentController().run(opts);

    expect(result.status).toBe("completed");
    // The oldest turns were dropped; the current question always survives.
    const sent = provider.calls[0].messages;
    expect(sent.length).toBeLessThan(5);
    expect(sent[sent.length - 1]).toEqual({
      role: "user",
      content: "what now?",
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "notice",
        message: expect.stringContaining("trimmed"),
      }),
    );
  });

  it("does not trim history when it fits the context window", async () => {
    const { opts, provider } = makeOptions();
    opts.contextLimit = 100_000;
    opts.messages = [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
    ];
    provider.turns.push({ text: "Answer." });

    await new AgentController().run(opts);

    expect(provider.calls[0].messages).toHaveLength(3);
  });
});
