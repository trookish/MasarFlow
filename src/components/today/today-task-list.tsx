"use client";

/**
 * One Today bucket: a titled list with a due-date control per row. Every row
 * can be opened in a project tab (EntityChip semantics, P5) and its deadline set to
 * today or cleared — the two actions that make this list worth having.
 */

import { CalendarDays, CircleSlash, Timer } from "lucide-react";
import type { Task } from "@/lib/db/schema";
import { openEntity } from "@/lib/entities/open";
import { Button } from "@/components/ui/button";
import { clearTaskDue, setTaskDue } from "@/lib/today/tasks";
import { dayKey, type TodayBucket } from "@/lib/today/model";
import { cn } from "@/lib/utils/cn";

const PRIORITY_CLASS: Record<string, string> = {
  urgent: "text-destructive",
  high: "text-amber-500",
  medium: "text-muted-foreground",
  low: "text-muted-foreground",
};

export function TodayTaskList({
  bucket,
  title,
  description,
  tasks,
  emptyText,
}: {
  bucket: TodayBucket;
  title: string;
  description: string;
  tasks: Task[];
  emptyText: string;
}) {
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-card">
      <header className="flex items-baseline gap-2 border-b border-border px-3 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
        <p className="ml-auto text-xs text-muted-foreground">{description}</p>
      </header>
      {tasks.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0">
              <button
                type="button"
                onClick={() => openEntity({ kind: "task", id: task.id })}
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                title="Open in Work"
              >
                {task.title}
              </button>
              {task.dueDate !== null ? (
                <span className={cn("shrink-0 text-xs", bucket === "overdue" && "text-destructive")}>
                  {bucket === "overdue" ? "Overdue since " : "Due "}
                  {dayKey(task.dueDate)}
                </span>
              ) : null}
              <span className={cn("shrink-0 text-xs uppercase", PRIORITY_CLASS[task.priority])}>
                {task.priority}
              </span>
              {bucket === "overdue" || bucket === "dueToday" ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Clear the deadline of ${task.title}`}
                  title="Clear the deadline"
                  onClick={() => void clearTaskDue(task.id)}
                >
                  <CircleSlash className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Set the deadline of ${task.title} to today`}
                  title="Due today"
                  onClick={() => void setTaskDue(task.id, Date.now())}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {bucket === "inProgress" ? (
        <p className="flex items-center gap-1.5 px-3 pb-2 text-xs text-muted-foreground">
          <Timer className="h-3 w-3" /> In review counts as in progress.
        </p>
      ) : null}
    </section>
  );
}
