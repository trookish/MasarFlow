import { describe, it, expect } from "vitest";
import { trimHistoryForContext } from "@/lib/ai/agent/history";
import type { WireMessage } from "@/lib/ai/chat-client";

/**
 * Context-window guard: long threads must be trimmed to fit the model's
 * window — otherwise every request after the thread grows past the limit
 * fails with a 400 ("works fine until some chatting, then stops responding").
 */

function user(content: string): WireMessage {
  return { role: "user", content };
}
function assistant(
  content: string,
  toolCalls?: { id: string; name: string }[],
): WireMessage {
  return {
    role: "assistant",
    content,
    toolCalls: toolCalls?.map((c) => ({
      id: c.id,
      name: c.name,
      arguments: {},
    })),
  };
}
function tool(toolCallId: string): WireMessage {
  return { role: "tool", toolCallId, name: "echo", content: "{}" };
}

describe("trimHistoryForContext", () => {
  it("leaves history untouched without a context limit", () => {
    const messages = [user("a"), assistant("b"), user("c")];
    const result = trimHistoryForContext(messages, {});
    expect(result.messages).toBe(messages);
    expect(result.trimmed).toBe(false);
  });

  it("leaves history untouched when it fits the window", () => {
    const messages = [user("hello"), assistant("hi there")];
    const result = trimHistoryForContext(messages, { contextLimit: 100_000 });
    expect(result.trimmed).toBe(false);
    expect(result.messages).toHaveLength(2);
  });

  it("drops the oldest turns when the history exceeds the window", () => {
    const messages = [
      user("x".repeat(2000)),
      assistant("y".repeat(2000)),
      user("z".repeat(2000)),
      assistant("w".repeat(2000)),
      user("CURRENT QUESTION"),
    ];
    const result = trimHistoryForContext(messages, {
      contextLimit: 2000,
      system: "",
    });
    expect(result.trimmed).toBe(true);
    // The most recent user turn always survives.
    expect(result.messages[result.messages.length - 1]).toEqual(
      user("CURRENT QUESTION"),
    );
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.dropped).toBeGreaterThan(0);
  });

  it("never leaves an orphan tool result at the head of the trimmed list", () => {
    const messages = [
      user("first"),
      assistant("calling", [{ id: "t1", name: "echo" }]),
      tool("t1"),
      user("second"),
      assistant("final answer"),
    ];
    // Budget so small that everything except the tail gets cut.
    const result = trimHistoryForContext(messages, {
      contextLimit: 300,
      system: "",
    });
    expect(result.messages.every((m) => m.role !== "tool")).toBe(true);
  });

  it("keeps the last user message even when it alone exceeds the budget", () => {
    const messages = [
      user("old turn"),
      assistant("old answer"),
      user("HUGE".repeat(5000)),
    ];
    const result = trimHistoryForContext(messages, {
      contextLimit: 500,
      system: "",
    });
    expect(result.messages).toEqual([user("HUGE".repeat(5000))]);
  });

  it("counts the system prompt against the window", () => {
    const messages = [
      user("a".repeat(4000)),
      assistant("b".repeat(4000)),
      user("c".repeat(4000)),
    ];
    const withSystem = trimHistoryForContext(messages, {
      contextLimit: 12_000,
      system: "x".repeat(6000),
    });
    expect(withSystem.trimmed).toBe(true);
    const withoutSystem = trimHistoryForContext(messages, {
      contextLimit: 12_000,
      system: "",
    });
    expect(withoutSystem.trimmed).toBe(false);
  });
});
