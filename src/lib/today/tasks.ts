/**
 * The only writer of task due dates. Storing the START of the local day keeps
 * "overdue" a date question, never a time question (a task due today is never
 * overdue at 09:00).
 *
 * Note: the machine's timezone is what the user sees; do not use toISOString
 * anywhere in this file — it would shift the day for UTC+3 (see dayKey tests).
 */

import { db } from "@/lib/db";
import { now } from "@/lib/utils/ids";
import { startOfDay } from "./model";

/** Set (or move) a task's due date to the local day of `when`. */
export async function setTaskDue(taskId: string, when: number): Promise<void> {
  await db.tasks.update(taskId, { dueDate: startOfDay(when), updatedAt: now() });
}

/** Remove the deadline. */
export async function clearTaskDue(taskId: string): Promise<void> {
  await db.tasks.update(taskId, { dueDate: null, updatedAt: now() });
}
