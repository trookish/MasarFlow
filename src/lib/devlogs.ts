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

export type DevLogGroupBy = "day" | "week" | "month";

/** ISO-week key (YYYY-Www) for grouping. Week starts Monday. */
export function weekKey(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // Thursday of the current week decides the ISO year.
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - day + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86_400_000 -
        ((firstThursday.getDay() + 6) % 7)) /
        7,
    );
  return `${d.getFullYear()}-W${`${week}`.padStart(2, "0")}`;
}

/** Month key (YYYY-MM) for grouping. */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

function weekLabel(ts: number, now: number): string {
  if (weekKey(ts) === weekKey(now)) return "This week";
  if (weekKey(ts) === weekKey(now - 7 * 86_400_000)) return "Last week";
  return `Week of ${new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function monthLabel(ts: number, now: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "long",
    year:
      new Date(ts).getFullYear() === new Date(now).getFullYear()
        ? undefined
        : "numeric",
  });
}

/**
 * Group dev logs into buckets (day/week/month), newest bucket first and newest
 * entry first within each. Pure and total — safe with any input ordering.
 */
export function groupLogs(
  logs: DevLog[],
  groupBy: DevLogGroupBy = "day",
  now: number = Date.now(),
): DevLogDayGroup[] {
  const keyOf =
    groupBy === "week" ? weekKey : groupBy === "month" ? monthKey : dayKey;
  const labelOf =
    groupBy === "week" ? weekLabel : groupBy === "month" ? monthLabel : dayLabel;

  const sorted = [...logs].sort((a, b) => b.createdAt - a.createdAt);
  const groups: DevLogDayGroup[] = [];
  const byKey = new Map<string, DevLogDayGroup>();
  for (const log of sorted) {
    const key = keyOf(log.createdAt);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: labelOf(log.createdAt, now), logs: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.logs.push(log);
  }
  return groups;
}

/** Back-compat day grouping (kept for existing tests/callers). */
export function groupLogsByDay(
  logs: DevLog[],
  now: number = Date.now(),
): DevLogDayGroup[] {
  return groupLogs(logs, "day", now);
}
