import { describe, it, expect } from "vitest";
import {
  claimWorkspaceTool,
  getPendingCall,
  hasPendingCall,
  pendingCallCount,
  rejectWorkspaceTool,
  requestWorkspaceTool,
  resolveWorkspaceTool,
  subscribeWorkspaceTools,
  type PendingWorkspaceCall,
} from "@/lib/opencode/bridge";

/**
 * Subscribe first, then request — `requestWorkspaceTool` notifies
 * subscribers synchronously, so the captured call is the pending one.
 */
function setup(
  sessionId: string,
  name: string,
  args: Record<string, unknown> = {},
  timeoutMs?: number,
): { call: PendingWorkspaceCall; promise: Promise<string> } {
  let call: PendingWorkspaceCall | undefined;
  const unsubscribe = subscribeWorkspaceTools((c) => {
    if (!call) {
      call = c;
      unsubscribe();
    }
  });
  const promise = requestWorkspaceTool({ sessionId, name, args, timeoutMs });
  expect(call).toBeDefined();
  return { call: call!, promise };
}

describe("workspace-tool bridge registry", () => {
  it("registers a pending call and delivers it to subscribers", () => {
    const { call, promise } = setup("ses_1", "create_note", { title: "T" });
    expect(call.name).toBe("create_note");
    expect(call.sessionId).toBe("ses_1");
    expect(call.args).toEqual({ title: "T" });
    expect(call.claimed).toBe(false);
    expect(pendingCallCount()).toBe(1);
    expect(getPendingCall(call.correlationId)).toBe(call);
    resolveWorkspaceTool(call.correlationId, "{}");
    void promise;
  });

  it("claims a call exactly once and rejects a second claim", () => {
    const { call, promise } = setup("ses_1", "create_note");
    expect(claimWorkspaceTool(call.correlationId)).toBe(true);
    expect(claimWorkspaceTool(call.correlationId)).toBe(false);
    expect(claimWorkspaceTool("missing-id")).toBe(false);
    resolveWorkspaceTool(call.correlationId, "{}");
    void promise;
  });

  it("resolves a pending call with the browser's result string", async () => {
    const { call, promise } = setup("ses_1", "create_task");
    expect(claimWorkspaceTool(call.correlationId)).toBe(true);
    expect(
      resolveWorkspaceTool(call.correlationId, '{"ok":true,"id":"x"}'),
    ).toBe(true);
    expect(await promise).toBe('{"ok":true,"id":"x"}');
    expect(hasPendingCall(call.correlationId)).toBe(false);
    expect(pendingCallCount()).toBe(0);
  });

  it("rejects a pending call on browser-side failure", async () => {
    const { call, promise } = setup("ses_1", "create_note");
    expect(rejectWorkspaceTool(call.correlationId, "boom")).toBe(true);
    await expect(promise).rejects.toThrow(/boom/);
  });

  it("returns false for unknown calls on resolve/reject", () => {
    expect(resolveWorkspaceTool("nope", "{}")).toBe(false);
    expect(rejectWorkspaceTool("nope", "x")).toBe(false);
    expect(claimWorkspaceTool("nope")).toBe(false);
  });

  it("times out unanswered calls", async () => {
    const { call, promise } = setup("ses_1", "read_note", {}, 30);
    expect(hasPendingCall(call.correlationId)).toBe(true);
    await expect(promise).rejects.toThrow(/chat/i);
    expect(hasPendingCall(call.correlationId)).toBe(false);
  });

  it("delivers only to subscribers that match the session", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeWorkspaceTools((c) => {
      if (c.sessionId === "ses_2") seen.push(c.name);
    });
    const { promise: p1 } = setup("ses_1", "create_note");
    const { promise: p2 } = setup("ses_2", "read_spec");
    expect(seen).toEqual(["read_spec"]);
    unsubscribe();
    void p1;
    void p2;
  });
});
