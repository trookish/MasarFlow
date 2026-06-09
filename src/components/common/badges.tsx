"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { SpecStatus, TaskStatus, TaskPriority, DevLogKind, NoteType } from "@/lib/db/schema";

const SPEC_LABEL: Record<SpecStatus, string> = {
  draft: "Draft",
  review: "In Review",
  approved: "Approved",
  implementing: "Implementing",
  shipped: "Shipped",
};
const SPEC_VARIANT: Record<SpecStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  draft: "ghost",
  review: "warning",
  approved: "info",
  implementing: "default",
  shipped: "success",
};

export function SpecStatusBadge({ status }: { status: SpecStatus }) {
  return <Badge variant={SPEC_VARIANT[status]}>{SPEC_LABEL[status]}</Badge>;
}

const TASK_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};
const TASK_VARIANT: Record<TaskStatus, React.ComponentProps<typeof Badge>["variant"]> = {
  backlog: "ghost",
  todo: "secondary",
  in_progress: "info",
  review: "warning",
  done: "success",
};
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={TASK_VARIANT[status]}>{TASK_LABEL[status]}</Badge>;
}

const PRIORITY_VARIANT: Record<TaskPriority, React.ComponentProps<typeof Badge>["variant"]> = {
  low: "ghost",
  medium: "secondary",
  high: "warning",
  urgent: "danger",
};
export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge variant={PRIORITY_VARIANT[priority]}>{priority}</Badge>;
}

const DEVLOG_LABEL: Record<DevLogKind, string> = {
  feature: "Feature",
  refactor: "Refactor",
  decision: "Decision",
  discussion: "Discussion",
  lesson: "Lesson",
  failure: "Failure",
  success: "Success",
  milestone: "Milestone",
};
const DEVLOG_VARIANT: Record<DevLogKind, React.ComponentProps<typeof Badge>["variant"]> = {
  feature: "default",
  refactor: "info",
  decision: "secondary",
  discussion: "ghost",
  lesson: "warning",
  failure: "danger",
  success: "success",
  milestone: "default",
};
export function DevLogKindBadge({ kind }: { kind: DevLogKind }) {
  return <Badge variant={DEVLOG_VARIANT[kind]}>{DEVLOG_LABEL[kind]}</Badge>;
}

const NOTE_LABEL: Record<NoteType, string> = {
  idea: "Idea",
  system: "System",
  mechanic: "Mechanic",
  research: "Research",
  experiment: "Experiment",
  note: "Note",
  lore: "Lore",
  decision: "Decision",
};
export function NoteTypeBadge({ type }: { type: NoteType }) {
  return <Badge variant="outline">{NOTE_LABEL[type]}</Badge>;
}
