import type { Task, TaskStatus } from "@/lib/db/schema";

/**
 * One task model (v0.3 P6 T4). Status is the only input: a leaf task's progress follows its status,
 * a parent task's progress is the mean of its subtasks, and a spec's progress is the share of its
 * tasks that are done. Nothing sets progress by hand any more, so status and progress cannot disagree.
 */
export const STATUS_PROGRESS: Record<TaskStatus, number> = {
  backlog: 0,
  todo: 0,
  in_progress: 50,
  review: 90,
  done: 100,
};

/** Progress for a task from its own status, or the mean of its subtasks when it has any. Pure. */
export function deriveProgress(
  status: TaskStatus,
  children: ReadonlyArray<Pick<Task, "progress">> = [],
): number {
  if (children.length === 0) return STATUS_PROGRESS[status];
  return Math.round(
    children.reduce((sum, c) => sum + c.progress, 0) / children.length,
  );
}

/** Spec implementation progress: the share of its tasks that are done (0 to 100). Pure. */
export function specProgress(
  tasks: ReadonlyArray<Pick<Task, "status">>,
): number {
  if (tasks.length === 0) return 0;
  return Math.round(
    (tasks.filter((t) => t.status === "done").length / tasks.length) * 100,
  );
}

/** Who a task can be assigned to in the interface: a person, or the AI. */
export const TASK_ASSIGNEES = [
  { value: "human", label: "Me" },
  { value: "ai", label: "AI" },
] as const;

/**
 * Label for any stored assignee. Older data may carry an internal agent role (architect,
 * programmer, ...); those read as "AI" and keep their stored value until the user changes it.
 */
export function assigneeLabel(assignee: Task["assignee"]): string {
  return assignee === "human" ? "Me" : "AI";
}
