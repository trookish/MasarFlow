/**
 * The Today view's brain: which tasks belong in which list, and what "today"
 * means. Pure — the view supplies `Date.now()` and the rows.
 *
 * Ordering rules (documented because the UI must not re-sort):
 *   overdue   -> earliest due first (worst first)
 *   dueToday  -> priority (urgent, high, medium, low), then most recently updated
 *   inProgress-> most recently updated first
 *   upNext    -> priority, then most recently updated
 *
 * Pure TypeScript only — no React, Next, DOM, or Dexie imports.
 */

import type { Task } from "@/lib/db/schema";

export type TodayBucket = "overdue" | "dueToday" | "inProgress" | "upNext";
export const TODAY_BUCKETS: TodayBucket[] = ["overdue", "dueToday", "inProgress", "upNext"];

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Local midnight of the day containing `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Last millisecond of the local day containing `ts`. */
export function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** "YYYY-MM-DD" in LOCAL time — never toISOString (it shifts the day). */
/* Named `dayKey` to match P7's wording (P7 plan, src/lib/vault/daily.ts) — P7's takes a `Date`, this one a
 * timestamp, and both must resolve the same local day. If P7 ever exports a shared `dayKey`, delete this one and
 * import theirs; the T17 test (`dayKey`/`startOfDay`/`endOfDay` cases) is what keeps the behaviour pinned until then. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local "YYYY-MM-DD" from an `<input type="date">` to the start of that local day, or null. */
export function parseDayKey(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** Which Today list a task belongs in, or null when it is not today's business. */
export function bucketOf(task: Task, now: number): TodayBucket | null {
  if (task.status === "done") return null;
  const due = task.dueDate ?? null;
  if (due !== null && due < startOfDay(now)) return "overdue";
  if (due !== null && due <= endOfDay(now)) return "dueToday";
  if (task.status === "in_progress" || task.status === "review") return "inProgress";
  if (task.status === "todo" && (task.priority === "urgent" || task.priority === "high")) {
    return "upNext";
  }
  return null;
}

export interface TodayGroups {
  overdue: Task[];
  dueToday: Task[];
  inProgress: Task[];
  upNext: Task[];
  counts: Record<TodayBucket, number>;
  /** Every task that made it onto the page, in display order. */
  all: Task[];
}

function byPriorityThenUpdated(a: Task, b: Task): number {
  const rank = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  return rank !== 0 ? rank : b.updatedAt - a.updatedAt;
}

export function groupTasks(tasks: Task[], now: number = Date.now()): TodayGroups {
  const groups: TodayGroups = {
    overdue: [],
    dueToday: [],
    inProgress: [],
    upNext: [],
    counts: { overdue: 0, dueToday: 0, inProgress: 0, upNext: 0 },
    all: [],
  };

  for (const task of tasks) {
    const bucket = bucketOf(task, now);
    if (!bucket) continue;
    groups[bucket].push(task);
  }

  groups.overdue.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
  groups.dueToday.sort(byPriorityThenUpdated);
  groups.inProgress.sort((a, b) => b.updatedAt - a.updatedAt);
  groups.upNext.sort(byPriorityThenUpdated);

  for (const bucket of TODAY_BUCKETS) {
    groups.counts[bucket] = groups[bucket].length;
    groups.all.push(...groups[bucket]);
  }
  return groups;
}
