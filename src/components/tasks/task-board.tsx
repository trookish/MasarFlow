"use client";

import { useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import type { Spec, Task } from "@/lib/db/schema";
import { TASK_STATUSES, TASK_PRIORITIES, ASSIGNEES } from "@/lib/workflow";
import { usePlugin, settingInt } from "@/lib/plugins-runtime";
import { cn } from "@/lib/utils/cn";
import { TaskCard } from "./task-card";

export type GroupBy = "status" | "priority" | "assignee";

interface Column {
  value: string;
  label: string;
}

/** Columns + the patch applied when a card is dropped, per grouping mode. */
function columnsFor(groupBy: GroupBy): Column[] {
  switch (groupBy) {
    case "priority":
      return TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label }));
    case "assignee":
      return ASSIGNEES.map((a) => ({
        value: a,
        label: a.charAt(0).toUpperCase() + a.slice(1),
      }));
    case "status":
    default:
      return TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }));
  }
}

interface TaskBoardProps {
  tasks: Task[];
  specsById: Map<string, Spec>;
  groupBy: GroupBy;
  onOpen: (taskId: string) => void;
  onSet: (taskId: string, patch: Partial<Task>) => void;
  onCreate: (patch: Partial<Task>) => void;
}

export function TaskBoard({
  tasks,
  specsById,
  groupBy,
  onOpen,
  onSet,
  onCreate,
}: TaskBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const columns = columnsFor(groupBy);

  // Kanban WIP Limits plugin: flag columns holding more active work than the
  // configured limit (applies to status columns except backlog/done).
  const wip = usePlugin("wip-limits");
  const wipLimit = settingInt(wip.settings, "limit", 5);
  const wipApplies = (col: string) =>
    wip.active && groupBy === "status" && col !== "backlog" && col !== "done";

  function drop(value: string) {
    if (dragId) onSet(dragId, { [groupBy]: value } as Partial<Task>);
    setDragId(null);
    setOverCol(null);
  }

  return (
    <div className="scrollbar-thin flex h-full gap-3 overflow-x-auto p-4">
      {columns.map((col) => {
        const colTasks = tasks.filter(
          (t) => (t[groupBy] as string) === col.value,
        );
        const overLimit = wipApplies(col.value) && colTasks.length > wipLimit;
        return (
          <div
            key={col.value}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.value);
            }}
            onDragLeave={() => setOverCol((s) => (s === col.value ? null : s))}
            onDrop={() => drop(col.value)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
              overCol === col.value
                ? "border-primary/50 bg-accent/40"
                : overLimit
                  ? "border-node-decision/60"
                  : "border-border",
            )}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide">
                {col.label}
                {overLimit && (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-node-decision/15 px-1.5 py-0.5 text-[10px] font-medium text-node-decision"
                    title={`Over WIP limit (${colTasks.length}/${wipLimit})`}
                  >
                    <AlertTriangle className="h-3 w-3" /> WIP
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground",
                  overLimit && "bg-node-decision/15 text-node-decision",
                )}
              >
                {wipApplies(col.value)
                  ? `${colTasks.length}/${wipLimit}`
                  : colTasks.length}
              </span>
            </div>
            <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {colTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  specNumber={
                    task.specId
                      ? specsById.get(task.specId)?.number
                      : undefined
                  }
                  dragging={dragId === task.id}
                  onClick={() => onOpen(task.id)}
                  onDragStart={(e) => {
                    setDragId(task.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragId(null)}
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  onCreate(
                    groupBy === "status"
                      ? { status: col.value as Task["status"] }
                      : ({ status: "todo", [groupBy]: col.value } as Partial<Task>),
                  )
                }
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
