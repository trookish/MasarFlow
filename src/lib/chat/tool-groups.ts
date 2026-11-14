import type { ToolActivity } from "@/lib/db/schema";

/**
 * Tool-call presentation for an assistant reply.
 *
 *   verbose  every group expanded
 *   normal   groups collapsed, a group with a failed call expanded
 *   summary  assistant text only, tool calls reduced to a count chip
 */
export type ToolViewMode = "verbose" | "normal" | "summary";

export const TOOL_VIEW_MODES: readonly ToolViewMode[] = [
  "verbose",
  "normal",
  "summary",
];

export const TOOL_VIEW_LABELS: Record<ToolViewMode, string> = {
  verbose: "Verbose",
  normal: "Normal",
  summary: "Summary",
};

export const TOOL_VIEW_HINTS: Record<ToolViewMode, string> = {
  verbose: "Every tool call group is expanded.",
  normal: "Tool call groups are collapsed; a group with a failed call opens.",
  summary: "Only the reply text, with a count of tool calls.",
};

export function normalizeToolViewMode(value: unknown): ToolViewMode {
  return TOOL_VIEW_MODES.includes(value as ToolViewMode)
    ? (value as ToolViewMode)
    : "normal";
}

export type ToolCallStatus = "running" | "ok" | "failed";

export function toolCallStatus(call: ToolActivity): ToolCallStatus {
  if (call.running) return "running";
  return call.ok ? "ok" : "failed";
}

export const TOOL_STATUS_LABELS: Record<ToolCallStatus, string> = {
  running: "Running",
  ok: "OK",
  failed: "Failed",
};

/** The consecutive tool calls one assistant turn made. */
export interface ToolGroup {
  calls: ToolActivity[];
  total: number;
  running: number;
  failed: number;
}

/**
 * An assistant turn records its tool calls as one ordered run, with the reply
 * text after it — so a turn has at most one group. Returns null for no calls.
 */
export function groupToolCalls(
  calls: readonly ToolActivity[] | null | undefined,
): ToolGroup | null {
  if (!calls || calls.length === 0) return null;
  let running = 0;
  let failed = 0;
  for (const c of calls) {
    const status = toolCallStatus(c);
    if (status === "running") running++;
    else if (status === "failed") failed++;
  }
  return { calls: [...calls], total: calls.length, running, failed };
}

const SUMMARY_NAME_LIMIT = 4;

/** `3 tool calls: read_file, search, patch` (+ running / failed counts). */
export function toolGroupSummary(group: ToolGroup): string {
  const names: string[] = [];
  for (const c of group.calls) if (!names.includes(c.name)) names.push(c.name);
  const shown = names.slice(0, SUMMARY_NAME_LIMIT).join(", ");
  const extra =
    names.length > SUMMARY_NAME_LIMIT
      ? ` +${names.length - SUMMARY_NAME_LIMIT} more`
      : "";
  const parts = [
    `${group.total} tool ${group.total === 1 ? "call" : "calls"}: ${shown}${extra}`,
  ];
  if (group.running > 0) parts.push(`${group.running} running`);
  if (group.failed > 0) parts.push(`${group.failed} failed`);
  return parts.join(" · ");
}

/** The count chip the Summary mode shows in place of the group. */
export function toolCountChip(group: ToolGroup): string {
  const base = `${group.total} tool ${group.total === 1 ? "call" : "calls"}`;
  return group.failed > 0 ? `${base}, ${group.failed} failed` : base;
}

export interface ToolGroupPresentation {
  /** Render the collapsible group. */
  showGroup: boolean;
  /** Render only the count chip. */
  showChip: boolean;
  /** Initial expanded state of the group. */
  defaultOpen: boolean;
}

export function presentToolGroup(
  mode: ToolViewMode,
  group: ToolGroup | null,
): ToolGroupPresentation {
  if (!group) return { showGroup: false, showChip: false, defaultOpen: false };
  switch (mode) {
    case "verbose":
      return { showGroup: true, showChip: false, defaultOpen: true };
    case "summary":
      return { showGroup: false, showChip: true, defaultOpen: false };
    case "normal":
    default:
      return {
        showGroup: true,
        showChip: false,
        defaultOpen: group.failed > 0,
      };
  }
}

/** Whether Summary mode also hides the extended-thinking trace. */
export function hidesReasoning(mode: ToolViewMode): boolean {
  return mode === "summary";
}

/** Pretty-print stored arguments for the expanded call. */
export function formatToolArguments(
  args: Record<string, unknown> | undefined,
): string {
  if (!args) return "";
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}
