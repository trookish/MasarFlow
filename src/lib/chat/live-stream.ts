import type { ChatMessage, ToolActivity } from "@/lib/db/schema";

/** What an in-flight assistant turn has produced so far (not yet persisted). */
export interface LiveStream {
  id: string;
  text: string;
  reasoning: string;
  tools: ToolActivity[];
  notices: string[];
  files: string[];
}

/** Convert a snake_case tool name (`read_note`) to camelCase (`readNote`). */
export function prettyToolName(name: string): string {
  return name
    .split("_")
    .map((p, i) => (i === 0 ? p : p[0]?.toUpperCase() + p.slice(1)))
    .join("");
}

/**
 * A user message identical to the thread's last user message, created less
 * than 2s ago, is a double-fire (e.g. a key-repeat Enter) — dedupe it.
 */
export function isDuplicateUserMessage(m: ChatMessage, text: string): boolean {
  return (
    m.role === "user" && m.content === text && Date.now() - m.createdAt < 2000
  );
}

/** One-line description of a tool call's arguments, shown next to its name. */
export function summarizeToolArgs(args: Record<string, unknown>): string {
  const s = (k: string): string | undefined => {
    const v = args[k];
    return typeof v === "string" && v.trim() ? v : undefined;
  };
  const title = s("title") ?? s("name") ?? s("command") ?? s("path");
  if (title) return title.slice(0, 80);
  if (s("query")) return `"${s("query")!.slice(0, 60)}"`;
  return "";
}

/** Longest tool output kept on a stored message. */
export const MAX_STORED_TOOL_RESULT = 6000;

/** Truncate a tool result for storage, marking the cut. */
export function clipToolResult(content: string): string {
  return content.length <= MAX_STORED_TOOL_RESULT
    ? content
    : `${content.slice(0, MAX_STORED_TOOL_RESULT)}\n… (${content.length - MAX_STORED_TOOL_RESULT} more characters not stored)`;
}
