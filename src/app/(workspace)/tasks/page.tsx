"use client";
import * as React from "react";
import { ListTodo, Plus, GitBranch } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskStatusBadge, TaskPriorityBadge } from "@/components/common/badges";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useTasks } from "@/lib/db/repos/misc";
import type { Task, TaskStatus } from "@/lib/db/schema";
import { cn, pluralize } from "@/lib/utils";

const COLUMNS: { id: TaskStatus; label: string; tint: string }[] = [
  { id: "backlog", label: "Backlog", tint: "var(--muted-foreground)" },
  { id: "todo", label: "To Do", tint: "var(--info)" },
  { id: "in_progress", label: "In Progress", tint: "var(--primary)" },
  { id: "review", label: "Review", tint: "var(--warning)" },
  { id: "done", label: "Done", tint: "var(--success)" },
];

export default function TasksPage() {
  const project = useActiveProject();
  const tasks = useTasks(project?.id);
  const [view, setView] = React.useState<"board" | "list">("board");

  const grouped = React.useMemo(() => {
    const g: Record<TaskStatus, Task[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    (tasks ?? []).forEach((t) => g[t.status].push(t));
    return g;
  }, [tasks]);

  return (
    <div className="pb-10">
      <PageHeader
        icon={ListTodo}
        eyebrow="Tasks"
        title="Work, dependencies, progress"
        description="Every task links to a spec, an architecture node, and its dependencies. Progress auto-updates from implementation."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-border bg-surface-2 p-0.5 text-xs">
              {(["board", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-sm px-2.5 py-1 transition-colors",
                    view === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New task
            </Button>
          </div>
        }
      />

      {view === "board" ? (
        <div className="grid gap-3 overflow-x-auto px-6 py-5" style={{ gridTemplateColumns: "repeat(5, minmax(240px, 1fr))" }}>
          {COLUMNS.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-2.5">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.tint }} />
                  {c.label}
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {grouped[c.id].length}
                </span>
              </div>
              <div className="space-y-2 p-2">
                {grouped[c.id].map((t) => (
                  <div
                    key={t.id}
                    className="rounded-md border border-border bg-surface p-2.5 text-xs transition-colors hover:border-border/80 hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-1.5">
                      <TaskPriorityBadge priority={t.priority} />
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {t.progress}%
                      </span>
                    </div>
                    <div className="mt-1 text-pretty text-sm font-medium leading-snug">{t.title}</div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{t.assignee}</span>
                      {t.dependencies.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <GitBranch className="h-3 w-3" /> {t.dependencies.length}
                        </span>
                      )}
                    </div>
                    {t.progress > 0 && t.progress < 100 && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${t.progress}%` }} />
                      </div>
                    )}
                  </div>
                ))}
                {grouped[c.id].length === 0 && (
                  <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[10px] text-muted-foreground">
                    Nothing here.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5 px-6 py-5">
          {tasks?.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5 text-sm"
            >
              <TaskStatusBadge status={t.status} />
              <span className="flex-1 truncate">{t.title}</span>
              <TaskPriorityBadge priority={t.priority} />
              <span className="font-mono text-[10px] text-muted-foreground">{t.assignee}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
