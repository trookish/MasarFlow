import { describe, it, expect } from "vitest";
import type { ToolActivity } from "@/lib/db/schema";
import {
  formatToolArguments,
  groupToolCalls,
  hidesReasoning,
  normalizeToolViewMode,
  presentToolGroup,
  toolCallStatus,
  toolCountChip,
  toolGroupSummary,
} from "@/lib/chat/tool-groups";

const call = (
  name: string,
  extra: Partial<ToolActivity> = {},
): ToolActivity => ({
  name,
  summary: "",
  ok: true,
  running: false,
  ...extra,
});

describe("groupToolCalls", () => {
  it("returns null when a turn made no tool calls", () => {
    expect(groupToolCalls([])).toBeNull();
    expect(groupToolCalls(undefined)).toBeNull();
  });

  it("counts total, running and failed calls and keeps order", () => {
    const g = groupToolCalls([
      call("read_file"),
      call("search", { ok: false }),
      call("patch", { running: true }),
    ])!;
    expect(g.total).toBe(3);
    expect(g.failed).toBe(1);
    expect(g.running).toBe(1);
    expect(g.calls.map((c) => c.name)).toEqual([
      "read_file",
      "search",
      "patch",
    ]);
  });

  it("does not count a running call as failed", () => {
    const g = groupToolCalls([call("a", { running: true, ok: false })])!;
    expect(g.failed).toBe(0);
    expect(g.running).toBe(1);
  });
});

describe("toolCallStatus", () => {
  it("maps the stored flags to running, ok and failed", () => {
    expect(toolCallStatus(call("a", { running: true }))).toBe("running");
    expect(toolCallStatus(call("a"))).toBe("ok");
    expect(toolCallStatus(call("a", { ok: false }))).toBe("failed");
  });
});

describe("toolGroupSummary", () => {
  it("names the calls in one line", () => {
    const g = groupToolCalls([
      call("read_file"),
      call("search"),
      call("patch"),
    ])!;
    expect(toolGroupSummary(g)).toBe("3 tool calls: read_file, search, patch");
  });

  it("uses the singular for one call and de-duplicates names", () => {
    expect(toolGroupSummary(groupToolCalls([call("a")])!)).toBe(
      "1 tool call: a",
    );
    expect(toolGroupSummary(groupToolCalls([call("a"), call("a")])!)).toBe(
      "2 tool calls: a",
    );
  });

  it("truncates a long name list and reports failures", () => {
    const g = groupToolCalls([
      call("a"),
      call("b"),
      call("c"),
      call("d"),
      call("e", { ok: false }),
    ])!;
    expect(toolGroupSummary(g)).toBe(
      "5 tool calls: a, b, c, d +1 more · 1 failed",
    );
  });
});

describe("view modes", () => {
  const ok = groupToolCalls([call("a"), call("b")]);
  const failed = groupToolCalls([call("a"), call("b", { ok: false })]);

  it("verbose expands every group", () => {
    expect(presentToolGroup("verbose", ok)).toEqual({
      showGroup: true,
      showChip: false,
      defaultOpen: true,
    });
    expect(presentToolGroup("verbose", failed).defaultOpen).toBe(true);
  });

  it("normal collapses a clean group and expands one with a failure", () => {
    expect(presentToolGroup("normal", ok).defaultOpen).toBe(false);
    expect(presentToolGroup("normal", failed).defaultOpen).toBe(true);
    expect(presentToolGroup("normal", ok).showGroup).toBe(true);
  });

  it("summary shows only the count chip", () => {
    const p = presentToolGroup("summary", failed);
    expect(p.showGroup).toBe(false);
    expect(p.showChip).toBe(true);
    expect(toolCountChip(ok!)).toBe("2 tool calls");
    expect(toolCountChip(failed!)).toBe("2 tool calls, 1 failed");
    expect(hidesReasoning("summary")).toBe(true);
    expect(hidesReasoning("normal")).toBe(false);
  });

  it("shows nothing for a turn without tool calls in every mode", () => {
    for (const m of ["verbose", "normal", "summary"] as const) {
      const p = presentToolGroup(m, null);
      expect(p.showGroup || p.showChip).toBe(false);
    }
  });

  it("falls back to normal for an unknown stored mode", () => {
    expect(normalizeToolViewMode("verbose")).toBe("verbose");
    expect(normalizeToolViewMode("loud")).toBe("normal");
    expect(normalizeToolViewMode(undefined)).toBe("normal");
  });
});

describe("formatToolArguments", () => {
  it("pretty-prints arguments and tolerates their absence", () => {
    expect(formatToolArguments({ q: 1 })).toBe('{\n  "q": 1\n}');
    expect(formatToolArguments(undefined)).toBe("");
  });
});
