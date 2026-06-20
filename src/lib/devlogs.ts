import type { DevLog } from "@/lib/db/schema";

/** All dev-log entry types, in the order shown in the filter bar. */
export const DEVLOG_TYPES = [
  "commit",
  "change",
  "system",
  "agent",
  "note",
  "spec",
  "task",
] as const;

export type DevLogType = (typeof DEVLOG_TYPES)[number];

export const DEVLOG_TYPE_LABEL: Record<DevLogType, string> = {
  commit: "Commit",
  change: "Change",
  system: "System",
  agent: "Agent",
  note: "Note",
  spec: "Spec",
  task: "Task",
};

/** Tailwind text-color class per type (backed by themeable --node-* tokens). */
export const DEVLOG_TYPE_COLOR: Record<DevLogType, string> = {
  commit: "text-node-commit",
  change: "text-node-idea",
  system: "text-node-system",
  agent: "text-node-research",
  note: "text-node-note",
  spec: "text-node-spec",
  task: "text-node-task",
};

/** Local calendar-day key (YYYY-MM-DD) for grouping. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Human day label relative to `now`: Today / Yesterday / a full date. */
export function dayLabel(ts: number, now: number = Date.now()): string {
  const key = dayKey(ts);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(now - 86_400_000)) return "Yesterday";
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      new Date(ts).getFullYear() === new Date(now).getFullYear()
        ? undefined
        : "numeric",
  });
}

export interface DevLogDayGroup {
  key: string;
  label: string;
  logs: DevLog[];
}

/**
 * Group dev logs into calendar days, newest day first and newest entry first
 * within each day. Pure and total — safe to call with any ordering of input.
 */
export function groupLogsByDay(
  logs: DevLog[],
  now: number = Date.now(),
): DevLogDayGroup[] {
  const sorted = [...logs].sort((a, b) => b.createdAt - a.createdAt);
  const groups: DevLogDayGroup[] = [];
  const byKey = new Map<string, DevLogDayGroup>();
  for (const log of sorted) {
    const key = dayKey(log.createdAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: dayLabel(log.createdAt, now), logs: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.logs.push(log);
  }
  return groups;
}
