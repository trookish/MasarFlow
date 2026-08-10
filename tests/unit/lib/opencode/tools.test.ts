import { describe, expect, it } from "vitest";

import { parseSseFrames } from "@/lib/opencode/events";
import {
  partUpdatedEvents,
  sessionEventToFrontend,
  createTranslationState,
  textPartDeltas,
  reasoningDeltas,
} from "@/lib/opencode/tools";
import type { OpenCodePart } from "@/lib/opencode/types";

function part(
  overrides: Partial<OpenCodePart> & { type: string },
): OpenCodePart {
  return {
    id: "prt_1",
    sessionID: "ses_1",
    messageID: "msg_1",
    ...overrides,
  } as OpenCodePart;
}

describe("parseSseFrames", () => {
  it("parses frames separated by blank lines", () => {
    const [frames, rest] = parseSseFrames(
      'data: {"directory":"d","payload":{"type":"a","properties":{}}}\n\ndata: {"directory":"d","payload":{"type":"b","properties":{}}}\n\n',
    );
    expect(frames).toHaveLength(2);
    expect(frames.map((f) => f.payload.type)).toEqual(["a", "b"]);
    expect(rest).toBe("");
  });

  it("skips keepalive comments and event:/id: lines", () => {
    const [frames, rest] = parseSseFrames(
      ': ping\n\nevent: message.part.updated\nid: 1\ndata: {"directory":"d","payload":{"type":"c","properties":{}}}\n\n',
    );
    expect(frames).toHaveLength(1);
    expect(frames[0].payload.type).toBe("c");
    expect(rest).toBe("");
  });

  it("keeps incomplete trailing data in the remainder", () => {
    const [frames, rest] = parseSseFrames(
      'data: {"directory":"d","payload":{"type":"a","properties":{}}}\n\npartial',
    );
    expect(frames).toHaveLength(1);
    expect(rest).toBe("partial");
  });

  it("skips malformed JSON without killing the stream", () => {
    const [frames] = parseSseFrames(
      'data: {not json}\n\ndata: {"directory":"d","payload":{"type":"a","properties":{}}}\n\n',
    );
    expect(frames).toHaveLength(1);
  });
});

describe("textPartDeltas", () => {
  it("prefers the wire delta when present", () => {
    const state = createTranslationState();
    const p = part({ type: "text", text: "hello" });
    expect(textPartDeltas(state, p, "hel")).toBe("hel");
    expect(textPartDeltas(state, p, "lo")).toBe("lo");
  });

  it("diffs accumulated text when no delta is sent", () => {
    const state = createTranslationState();
    const p1 = part({ type: "text", text: "Hello, I" });
    const p2 = part({ type: "text", text: "Hello, I found" });
    expect(textPartDeltas(state, p1, "")).toBe("Hello, I");
    expect(textPartDeltas(state, p2, "")).toBe(" found");
    expect(textPartDeltas(state, p2, "")).toBe("");
  });

  it("tracks reasoning parts separately", () => {
    const state = createTranslationState();
    const r1 = part({ type: "reasoning", text: "hmm" });
    const r2 = part({ type: "reasoning", text: "hmm so" });
    expect(reasoningDeltas(state, r1, "")).toBe("hmm");
    expect(reasoningDeltas(state, r2, "")).toBe(" so");
  });
});

describe("partUpdatedEvents", () => {
  it("emits tool state transitions in order", () => {
    const state = createTranslationState();
    const pending = part({
      type: "tool",
      callID: "c1",
      tool: "bash",
      state: { status: "pending", input: { command: "ls" }, raw: "" },
    });
    const running = part({
      type: "tool",
      callID: "c1",
      tool: "bash",
      state: {
        status: "running",
        input: { command: "ls" },
        time: { start: 0 },
      },
    });
    const done = part({
      type: "tool",
      callID: "c1",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "ls" },
        output: "out",
        title: "ls",
        metadata: {},
        time: { start: 0, end: 1 },
      },
    });

    const events = [
      ...partUpdatedEvents(state, pending, ""),
      ...partUpdatedEvents(state, running, ""),
      ...partUpdatedEvents(state, done, ""),
    ];
    expect(events.map((e) => e.type)).toEqual([
      "tool_call",
      "tool_running",
      "tool_result",
    ]);
    const call = events[0];
    if (call.type === "tool_call")
      expect(call.arguments).toEqual({ command: "ls" });
    const result = events[2];
    if (result.type === "tool_result") {
      expect(result.ok).toBe(true);
      expect(result.content).toBe("out");
    }
  });

  it("does not double-emit a tool_call for the same part", () => {
    const state = createTranslationState();
    const p = part({
      type: "tool",
      callID: "c1",
      tool: "bash",
      state: { status: "pending", input: {}, raw: "" },
    });
    expect(partUpdatedEvents(state, p, "").length).toBe(1);
    expect(partUpdatedEvents(state, p, "").length).toBe(0);
  });

  it("emits step-start as a round boundary", () => {
    const state = createTranslationState();
    const s1 = part({ type: "step-start" });
    const s2 = part({ type: "step-start" });
    expect(partUpdatedEvents(state, s1, "")[0]).toEqual({
      type: "step",
      step: 1,
    });
    expect(partUpdatedEvents(state, s2, "")[0]).toEqual({
      type: "step",
      step: 2,
    });
  });

  it("emits patch parts as file events", () => {
    const state = createTranslationState();
    const p = part({ type: "patch", hash: "h", files: ["a.ts", "b.ts"] });
    const events = partUpdatedEvents(state, p, "");
    expect(events).toEqual([
      { type: "file", path: "a.ts" },
      { type: "file", path: "b.ts" },
    ]);
  });
});

describe("sessionEventToFrontend", () => {
  it("maps retry status to a notice", () => {
    const events = sessionEventToFrontend({
      type: "session.status",
      properties: {
        sessionID: "s",
        status: {
          type: "retry",
          attempt: 2,
          message: "overloaded",
          next: 1000,
        },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("notice");
  });

  it("maps permission.updated to an approval event", () => {
    const events = sessionEventToFrontend({
      type: "permission.updated",
      properties: {
        id: "prm_1",
        type: "bash",
        pattern: "npm *",
        title: "Run command",
        sessionID: "ses_1",
        messageID: "msg_1",
        metadata: {},
        time: { created: 0 },
      },
    });
    expect(events[0]).toEqual({
      type: "approval",
      permissionId: "prm_1",
      permissionType: "bash",
      title: "Run command",
      pattern: "npm *",
    });
  });

  it("maps permission.asked (opencode 1.18 wire format) to an approval event", () => {
    const events = sessionEventToFrontend({
      type: "permission.asked",
      properties: {
        id: "per_1",
        sessionID: "ses_1",
        permission: "edit",
        pattern: "*",
        title: "Edit file",
      },
    });
    expect(events[0]).toEqual({
      type: "approval",
      permissionId: "per_1",
      permissionType: "edit",
      title: "Edit file",
      pattern: "*",
    });
  });

  it("prefers the permission field on permission.asked frames", () => {
    const events = sessionEventToFrontend({
      type: "permission.asked",
      properties: { id: "per_2", sessionID: "ses_1", permission: "bash" },
    });
    expect(events[0]).toMatchObject({
      type: "approval",
      permissionType: "bash",
      title: "bash",
    });
  });

  it("ignores unrelated events", () => {
    expect(
      sessionEventToFrontend({
        type: "session.updated",
        properties: { sessionID: "s" },
      }),
    ).toEqual([]);
  });

  it("maps question.asked to a question event with normalized fields", () => {
    const events = sessionEventToFrontend({
      type: "question.asked",
      properties: {
        id: "que_1",
        sessionID: "ses_1",
        questions: [
          {
            header: "Mode",
            question: "Which footer should be the reference?",
            options: [
              {
                label: "Permission",
                description: "Inspect the permission footer",
              },
              { label: "Prompt", description: "Return to the normal composer" },
            ],
            multiple: false,
            custom: true,
          },
        ],
        tool: { messageID: "msg_1", callID: "call_1" },
      },
    });
    expect(events[0]).toEqual({
      type: "question",
      questionId: "que_1",
      sessionId: "ses_1",
      questions: [
        {
          header: "Mode",
          question: "Which footer should be the reference?",
          options: [
            {
              label: "Permission",
              description: "Inspect the permission footer",
            },
            { label: "Prompt", description: "Return to the normal composer" },
          ],
          multiple: false,
          custom: true,
        },
      ],
    });
  });

  it("defaults missing question fields and drops empty question lists", () => {
    const events = sessionEventToFrontend({
      type: "question.asked",
      properties: {
        id: "que_2",
        sessionID: "ses_1",
        questions: [{ header: "", question: "Go ahead?", options: [] }],
      },
    });
    expect(events[0]).toMatchObject({
      type: "question",
      questions: [
        {
          header: "",
          question: "Go ahead?",
          options: [],
          multiple: false,
          custom: true,
        },
      ],
    });
    expect(
      sessionEventToFrontend({
        type: "question.asked",
        properties: { id: "que_3", sessionID: "ses_1", questions: [] },
      }),
    ).toEqual([]);
  });

  it("maps question.replied / question.rejected to a dismiss event", () => {
    expect(
      sessionEventToFrontend({
        type: "question.replied",
        properties: {
          sessionID: "ses_1",
          requestID: "que_1",
          answers: [["a"]],
        },
      }),
    ).toEqual([{ type: "question_dismissed" }]);
    expect(
      sessionEventToFrontend({
        type: "question.rejected",
        properties: { sessionID: "ses_1", requestID: "que_1" },
      }),
    ).toEqual([{ type: "question_dismissed" }]);
  });
});
