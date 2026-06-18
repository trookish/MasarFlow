import type {
  SpecStatus,
  TaskStatus,
  TaskPriority,
  Assignee,
} from "@/lib/db/schema";

/**
 * Display metadata for the spec/task workflow. Badge classes use semantic
 * theme tokens (never hex), so they follow the active theme + accent.
 */

export const SPEC_STATUSES: {
  value: SpecStatus;
  label: string;
  badge: string;
}[] = [
  { value: "draft", label: "Draft", badge: "bg-muted text-muted-foreground" },
  { value: "review", label: "In review", badge: "bg-warning/15 text-warning" },
  { value: "approved", label: "Approved", badge: "bg-primary/15 text-primary" },
  {
    value: "implementing",
    label: "Implementing",
    badge: "bg-node-research/15 text-node-research",
  },
  { value: "shipped", label: "Shipped", badge: "bg-success/15 text-success" },
];

export function specStatusMeta(value: SpecStatus) {
  return SPEC_STATUSES.find((s) => s.value === value) ?? SPEC_STATUSES[0];
}

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

export function taskStatusLabel(value: TaskStatus): string {
  return TASK_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export const TASK_PRIORITIES: {
  value: TaskPriority;
  label: string;
  badge: string;
}[] = [
  { value: "low", label: "Low", badge: "bg-muted text-muted-foreground" },
  {
    value: "medium",
    label: "Medium",
    badge: "bg-node-system/15 text-node-system",
  },
  { value: "high", label: "High", badge: "bg-warning/15 text-warning" },
  {
    value: "urgent",
    label: "Urgent",
    badge: "bg-destructive/15 text-destructive",
  },
];

export function priorityMeta(value: TaskPriority) {
  return TASK_PRIORITIES.find((p) => p.value === value) ?? TASK_PRIORITIES[0];
}

export const ASSIGNEES: Assignee[] = [
  "human",
  "ai",
  "architect",
  "programmer",
  "reviewer",
  "tester",
  "documenter",
  "designer",
  "optimizer",
];
