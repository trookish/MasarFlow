import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { projectsRepo } from "@/lib/db/repos";
import type {
  LLMProvider,
  ProviderStreamEvent,
  ProviderTurnOptions,
  ProviderTurnResult,
} from "@/lib/ai/agent/types";
import type { ProviderConnection } from "@/lib/ai/catalog";
import type { ToolCallRequest } from "@/lib/ai/tools";
import { FS_TOOLS } from "@/lib/ai/fs-tools";
import { getToolDef, WORKSPACE_TOOLS } from "@/lib/ai/workspace-tool-defs";
import {
  FALLBACK_CONTEXT_LIMIT,
  resolveContextLimit,
  runAgentTurn,
  type AgentTurnOptions,
  type TurnEvent,
} from "@/lib/ai/turn/run-agent-turn";
import {
  expandToolCall,
  toolsFor,
  toolsetPayloadBytes,
} from "@/lib/ai/turn/toolsets";

/** Scripted model: each turn returns the next list of tool calls, then a final answer. */
class Script implements LLMProvider {
  seen: ProviderTurnOptions[] = [];
  constructor(private turns: ToolCallRequest[][]) {}
  generate = vi.fn(
    async (
      opts: ProviderTurnOptions,
      onEvent: (e: ProviderStreamEvent) => void,
    ): Promise<ProviderTurnResult> => {
      this.seen.push(opts);
      const calls = this.turns.shift() ?? [];
      for (const c of calls)
        onEvent({
          type: "tool_call",
          id: c.id,
          name: c.name,
          arguments: c.arguments,
        });
      const text = calls.length ? "" : "Done.";
      if (text) onEvent({ type: "message_delta", delta: text });
      return {
        text,
        reasoning: "",
        toolCalls: calls,
        stopReason: calls.length ? "tool_calls" : "end",
      };
    },
  );
}

const PROVIDER = {
  id: "openai",
  name: "OpenAI",
  api: "https://api.openai.com/v1",
  npm: "@ai-sdk/openai",
} as unknown as ProviderConnection;
const SETTINGS = {
  maxIterations: 6,
  maxRunMs: 60_000,
  maxToolMs: 10_000,
  maxShellCommands: 3,
  maxFileModifications: 3,
};
const createNote = (title: string): ToolCallRequest => ({
  id: `c-${title}`,
  name: "create_entity",
  arguments: { kind: "note", fields: { title, body: "b" } },
});

let projectId = "";
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  projectId = (await projectsRepo.create({ name: "Turn" })).id;
});

function turn(llm: LLMProvider, over: Partial<AgentTurnOptions> = {}) {
  const events: TurnEvent[] = [];
  const run = runAgentTurn({
    surface: "chat",
    projectId,
    threadId: "t1",
    undoOwnerId: "m1",
    provider: PROVIDER,
    apiKey: "k",
    model: "gpt-x",
    messages: [{ role: "user", content: "go" }],
    toolset: "workspace",
    settings: SETTINGS,
    llm,
    onEvent: (e) => events.push(e),
    ...over,
  });
  return { run, events };
}

describe("coarse tool sets", () => {
  it("offers at most twelve tools and a fraction of the legacy schema payload", () => {
    const tools = toolsFor("workspace", { hasLinkedRoot: true });
    expect(tools.length).toBeLessThanOrEqual(12);
    expect(toolsetPayloadBytes(tools)).toBeLessThan(
      toolsetPayloadBytes([...WORKSPACE_TOOLS, ...FS_TOOLS]) * 0.6,
    );
    expect(
      toolsFor("workspace", { hasLinkedRoot: false }).some(
        (t) => t.name === "write_file",
      ),
    ).toBe(false);
    expect(toolsFor("none", { hasLinkedRoot: true })).toEqual([]);
  });

  it("maps every kind of every verb to a real legacy tool", () => {
    for (const def of toolsFor("workspace", { hasLinkedRoot: true })) {
      const kinds =
        (def.parameters as { properties?: Record<string, { enum?: string[] }> })
          .properties?.kind?.enum ?? [];
      for (const kind of kinds) {
        const out = expandToolCall({
          id: "x",
          name: def.name,
          arguments: { kind, id: "i", fields: {} },
        });
        expect(out.ok, `${def.name}/${kind}`).toBe(true);
        if (out.ok)
          expect(
            getToolDef(out.call.name) ??
              FS_TOOLS.find((t) => t.name === out.call.name),
            out.call.name,
          ).toBeTruthy();
      }
    }
  });

  it("passes legacy names through and reports unknown kinds to the model", () => {
    const legacy = { id: "x", name: "create_note", arguments: { title: "a" } };
    expect(expandToolCall(legacy)).toEqual({ ok: true, call: legacy });
    expect(
      expandToolCall({
        id: "x",
        name: "create_entity",
        arguments: { kind: "planet", fields: {} },
      }),
    ).toEqual({ ok: false, error: 'Unknown kind "planet".' });
  });
});

describe("runAgentTurn", () => {
  it("chat: runs a coarse call through the legacy executor and records it for undo", async () => {
    const { run, events } = turn(new Script([[createNote("From chat")]]));
    const result = await run;
    expect(result.text).toBe("Done.");
    expect((await db.notes.toArray()).map((n) => n.title)).toEqual([
      "From chat",
    ]);
    expect(await db.aiUndo.where("chatMessageId").equals("m1").count()).toBe(1);
    expect(events.some((e) => e.type === "undo_recorded")).toBe(true);
  });

  it("agent: asks before changing records and refuses without an answer", async () => {
    const declined = turn(new Script([[createNote("Nope")]]), {
      surface: "agent",
    });
    await declined.run;
    expect(await db.notes.count()).toBe(0);
    expect(declined.events).toContainEqual({
      type: "approval",
      id: "c-Nope",
      name: "create_note",
      scope: "workspace",
      approved: false,
    });

    const ask = vi.fn(async () => true);
    await turn(new Script([[createNote("Yes")]]), {
      surface: "agent",
      requestApproval: ask,
    }).run;
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "agent",
        scope: "workspace",
        name: "create_note",
      }),
    );
    expect((await db.notes.toArray()).map((n) => n.title)).toEqual(["Yes"]);
  });

  it("uses the limits from settings, never more rounds than allowed", async () => {
    const forever = Array.from({ length: 10 }, (_, i) => [createNote(`n${i}`)]);
    const llm = new Script(forever);
    await expect(
      turn(llm, { settings: { ...SETTINGS, maxIterations: 2 } }).run,
    ).rejects.toThrow();
    expect(llm.generate.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("refuses file tools when the project has no linked folder", async () => {
    const llm = new Script([
      [{ id: "f", name: "read_file", arguments: { path: "a.txt" } }],
    ]);
    const result = await turn(llm).run;
    expect(JSON.parse(result.executed[0].result).ok).toBe(false);
    expect(llm.seen[0].tools?.some((t) => t.name === "read_file")).toBe(false);
  });

  it("reads the context window from the catalog, with a fallback", () => {
    const provider = {
      ...PROVIDER,
      models: { big: { limit: { context: 200_000 } } },
    } as unknown as ProviderConnection;
    expect(resolveContextLimit(provider, "big")).toBe(200_000);
    expect(resolveContextLimit(provider, "other")).toBe(FALLBACK_CONTEXT_LIMIT);
  });
});
