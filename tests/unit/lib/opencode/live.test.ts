/**
 * Live integration test against a real OpenCode server. Requires
 * OPENCODE_BASE_URL to point at a running `opencode serve` instance with at
 * least one connected provider (OPENCODE_SMOKE_PROVIDER/OPENCODE_SMOKE_MODEL
 * select it; defaults to opencode-go/deepseek-v4-flash). Skipped otherwise —
 * CI and normal `npm test` runs stay hermetic.
 */

import { afterAll, describe, expect, it } from "vitest";

import { opencodeClient } from "@/lib/opencode/client";
import { opencodeConfig } from "@/lib/opencode/config";
import { runTurn, type TurnInput } from "@/lib/opencode/turn";
import { ensureSession } from "@/lib/opencode/sessions";
import { parseSseFrames } from "@/lib/opencode/events";
import type { OpenCodeFrontendEvent } from "@/lib/opencode/types";

const baseUrl = process.env.OPENCODE_BASE_URL;
const live = Boolean(baseUrl && process.env.OPENCODE_SMOKE === "1");
const providerId = process.env.OPENCODE_SMOKE_PROVIDER ?? "opencode-go";
const modelId = process.env.OPENCODE_SMOKE_MODEL ?? "deepseek-v4-flash";

describe.skipIf(!live)("opencode live integration", () => {
  const client = opencodeClient({ config: { ...opencodeConfig(), baseUrl: baseUrl! } });

  afterAll(async () => {
    // Let the event bus linger-close on its own; nothing to tear down.
  });

  it("health check reports healthy", async () => {
    const health = await client.health();
    expect(health?.healthy).toBe(true);
  });

  it("creates a session and streams a full turn with tool calls", async () => {
    const ensured = await ensureSession(client, undefined, {
      directory: process.cwd(),
      title: "vitest-live",
      config: opencodeConfig(),
    });
    expect(ensured).not.toBeNull();
    const session = ensured!.session;
    expect(session.id).toMatch(/^ses/);

    const events: OpenCodeFrontendEvent[] = [];
    const stream = runTurn(client, { ...opencodeConfig(), firstEventMs: 30_000, idleMs: 30_000, totalMs: 120_000 }, {
      chatId: "live-test",
      sessionId: session.id,
      providerId,
      modelId,
      text: "List the files in this directory with a tool, then reply with just the word DONE.",
      toolsEnabled: true,
    } satisfies TurnInput);

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        events.push(JSON.parse(line) as OpenCodeFrontendEvent);
      }
    }

    const types = events.map((e) => e.type);
    expect(types).toContain("done");
    expect(types).toContain("text");
    const text = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
    expect(text).toMatch(/DONE/i);

    await client.deleteSession(session.id);
  }, 180_000);

  it("SSE frame parser handles keepalives and ignores event:/id: lines", () => {
    const [frames, rest] = parseSseFrames(
      ': ping\n\ndata: {"directory":"d","payload":{"type":"a","properties":{}}}\n\n' +
        'event: message.part.updated\nid: 1\ndata: {"directory":"d2","payload":{"type":"b","properties":{}}}\n\n',
    );
    expect(frames).toHaveLength(2);
    expect(frames[0].payload.type).toBe("a");
    expect(frames[1].payload.type).toBe("b");
    expect(rest).toBe("");
  });
});
