import type { MasarFlowDB } from "@/lib/db";
import { activityRepo } from "@/lib/db/repos/activity";
import { devLogsRepo } from "@/lib/db/repos/devLogs";
import {
  TRACKED_TABLES,
  describeChange,
  makeThrottle,
  type ActivityDraft,
  type ActivityOp,
} from "./describe";

const FLUSH_MS = 50;
const NOTE_COALESCE_MS = 60_000;

interface Pending {
  activity: ActivityDraft[];
  devLogs: Array<{ projectId: string; title: string; refId: string }>;
}

let pending: Pending = { activity: [], devLogs: [] };
let suspended = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> = Promise.resolve();

async function drain(): Promise<void> {
  const batch = pending;
  pending = { activity: [], devLogs: [] };
  if (batch.activity.length) {
    await activityRepo.addMany(batch.activity);
    for (const projectId of new Set(batch.activity.map((a) => a.projectId))) {
      await activityRepo.prune(projectId);
    }
  }
  for (const log of batch.devLogs) {
    await devLogsRepo.create({
      projectId: log.projectId,
      type: "task",
      title: log.title,
      refType: "task",
      refId: log.refId,
    });
  }
}

/** Run `fn` with recording off. Bulk imports and demo seeding are not user activity. */
export async function withoutActivity<T>(fn: () => Promise<T>): Promise<T> {
  suspended++;
  try {
    return await fn();
  } finally {
    suspended--;
  }
}

/** Write everything queued so far. Tests await this; production relies on the timer. */
export function flushActivity(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  inFlight = inFlight.then(drain).catch((err) => {
    console.warn("[activity] flush failed", err);
  });
  return inFlight;
}

function schedule(): void {
  if (!timer) timer = setTimeout(() => void flushActivity(), FLUSH_MS);
}

/** Subscribe to Dexie table hooks. Returns an unsubscribe function. */
export function installActivityTracking(db: MasarFlowDB): () => void {
  const allow = makeThrottle(NOTE_COALESCE_MS);
  const offs: Array<() => void> = [];

  const record = (
    table: string,
    op: ActivityOp,
    row: Record<string, unknown>,
    changes?: Record<string, unknown>,
  ): void => {
    if (suspended > 0) return;
    const d = describeChange(table, op, row, changes);
    if (!d) return;
    // Autosave churn: collapse repeated plain updates of the same entity.
    if (op === "updated" && typeof changes?.status !== "string") {
      if (!allow(`${d.entityKind}:${d.entityId}:updated`)) return;
    }
    pending.activity.push(d);
    // Automation rule: a task that just became done gets one dev-log entry.
    if (table === "tasks" && op === "updated" && changes?.status === "done" && row.status !== "done") {
      pending.devLogs.push({
        projectId: d.projectId,
        title: `Completed task "${String(row.title)}"`,
        refId: d.entityId,
      });
    }
    schedule();
  };

  for (const name of TRACKED_TABLES) {
    const table = db.table(name);
    const onCreate = (_k: unknown, obj: Record<string, unknown>): void => record(name, "created", obj);
    const onUpdate = (mods: unknown, _k: unknown, obj: Record<string, unknown>): void =>
      record(name, "updated", obj, (mods ?? {}) as Record<string, unknown>);
    const onDelete = (_k: unknown, obj: Record<string, unknown>): void => record(name, "deleted", obj);
    table.hook("creating", onCreate);
    table.hook("updating", onUpdate);
    table.hook("deleting", onDelete);
    offs.push(() => {
      table.hook("creating").unsubscribe(onCreate);
      table.hook("updating").unsubscribe(onUpdate);
      table.hook("deleting").unsubscribe(onDelete);
    });
  }
  return () => offs.forEach((f) => f());
}
