"use client";

import { User, Bot, FileText } from "lucide-react";
import type { Task } from "@/lib/db/schema";
import { priorityMeta } from "@/lib/workflow";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";

interface TaskCardProps {
  task: Task;
  specNumber?: string;
  dragging: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

export function TaskCard({
  task,
  specNumber,
  dragging,
  onClick,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  const priority = priorityMeta(task.priority);
  const isAi = task.assignee !== "human";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "cursor-grab space-y-2 rounded-md border border-border bg-card p-2.5 text-left shadow-sm transition-opacity active:cursor-grabbing",
        dragging ? "opacity-40" : "hover:border-primary/40",
      )}
    >
      <div className="text-sm font-medium">{task.title}</div>

      {task.progress > 0 ? (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={priority.badge}>{priority.label}</Badge>
        {specNumber ? (
          <Badge variant="outline" className="font-mono">
            <FileText className="h-3 w-3" />
            {specNumber}
          </Badge>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground capitalize">
          {isAi ? (
            <Bot className="h-3 w-3" />
          ) : (
            <User className="h-3 w-3" />
          )}
          {task.assignee}
        </span>
      </div>

      {task.tags.length ? (
        <div className="flex flex-wrap gap-1">
          {task.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
