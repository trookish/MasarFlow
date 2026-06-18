"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Spec, Task, TaskStatus } from "@/lib/db/schema";
import { TASK_STATUSES } from "@/lib/workflow";
import { cn } from "@/lib/utils/cn";
import { TaskCard } from "./task-card";

interface TaskBoardProps {
  tasks: Task[];
  specsById: Map<string, Spec>;
  onOpen: (taskId: string) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onCreate: (status: TaskStatus) => void;
}

export function TaskBoard({
  tasks,
  specsById,
  onOpen,
  onMove,
  onCreate,
}: TaskBoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);

  function drop(status: TaskStatus) {
    if (dragId) onMove(dragId, status);
    setDragId(null);
    setOverStatus(null);
  }

  return (
    <div className="scrollbar-thin flex h-full gap-3 overflow-x-auto p-4">
      {TASK_STATUSES.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.value);
        return (
          <div
            key={col.value}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStatus(col.value);
            }}
            onDragLeave={() => setOverStatus((s) => (s === col.value ? null : s))}
            onDrop={() => drop(col.value)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
              overStatus === col.value
                ? "border-primary/50 bg-accent/40"
                : "border-border",
            )}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold tracking-wide">
                {col.label}
              </span>
              <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                {colTasks.length}
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
                onClick={() => onCreate(col.value)}
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
