"use client";
import * as React from "react";
import Link from "next/link";
import { useCreateDialogs, setOpenNewTask } from "@/lib/stores/create-dialogs";
import { ListTodo, Plus, GitBranch } from "lucide-react";
import { TaskEditorDialog } from "@/components/common/task-editor-dialog";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { SprintsView } from "@/components/tasks/sprints-view";
import { TaskStatusBadge, TaskPriorityBadge } from "@/components/common/badges";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useTasks } from "@/lib/db/repos/misc";
import { getDb, type Task, type TaskStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

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
  const [view, setView] = React.useState<"board" | "list" | "sprints">("board");
  const [editorOpenState, setEditorOpenState] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | undefined>(undefined);

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

  const openFlag = useCreateDialogs((s) => s.task);
  const editorOpen = editorOpenState || openFlag;
  const setEditorOpen = (v: boolean) => {
    setEditorOpenState(v);
    if (!v) setOpenNewTask(false);
  };

  return (
    <>
      <div className="pb-10">
        <PageHeader
          icon={ListTodo}
          eyebrow="Tasks"
          title="Work, dependencies, progress"
          description="Every task links to a spec, an architecture node, and its dependencies. Progress auto-updates from implementation."
          actions={
            <div className="flex items-center gap-2">
              <div className="border-border bg-surface-2 flex items-center rounded-md border p-0.5 text-xs">
                {(["board", "list", "sprints"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-sm px-2.5 py-1 transition-colors",
                      view === v
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <Button
                className="gap-2"
                onClick={() => {
                  setEditingTask(undefined);
                  setEditorOpenState(true);
                }}
              >
                <Plus className="h-4 w-4" /> New task
              </Button>
            </div>
          }
        />

        {view === "board" ? (
          <div
            className="grid gap-3 overflow-x-auto px-6 py-5"
            style={{ gridTemplateColumns: "repeat(5, minmax(240px, 1fr))" }}
          >
            {COLUMNS.map((c) => (
              <div 
                key={c.id} 
                className="border-border bg-card rounded-lg border flex flex-col"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  const taskId = e.dataTransfer.getData("application/masarflow-task-id");
                  if (!taskId) return;
                  const taskToMove = tasks?.find(t => t.id === taskId);
                  if (taskToMove && taskToMove.status !== c.id) {
                    const newProgress = c.id === "done" ? 100 : c.id === "in_progress" ? Math.max(taskToMove.progress, 25) : taskToMove.progress;
                    await getDb().tasks.update(taskId, { status: c.id, progress: newProgress, updatedAt: Date.now() });
                  }
                }}
              >
                <div className="border-border flex items-center justify-between border-b p-2.5">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.tint }} />
                    {c.label}
                  </div>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {grouped[c.id].length}
                  </span>
                </div>
                <div className="space-y-2 p-2 flex-1">
                  {grouped[c.id].map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/masarflow-task-id", t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="border-border bg-surface hover:border-border/80 hover:bg-accent/30 rounded-md border p-2.5 text-xs transition-colors cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-center gap-1.5">
                        <TaskPriorityBadge priority={t.priority} />
                        <span className="text-muted-foreground ml-auto font-mono text-[10px]">
                          {t.progress}%
                        </span>
                      </div>
                      <Link href={`/tasks/${t.id}`} className="mt-1 text-sm leading-snug font-medium text-pretty hover:underline block">
                        {t.title}
                      </Link>
                      <div className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-[10px]">
                        <span className="bg-muted rounded px-1.5 py-0.5 font-mono">
                          {t.assignee}
                        </span>
                        {t.dependencies.length > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <GitBranch className="h-3 w-3" /> {t.dependencies.length}
                          </span>
                        )}
                      </div>
                      {t.progress > 0 && t.progress < 100 && (
                        <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full">
                          <div className="bg-primary h-full" style={{ width: `${t.progress}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                  {grouped[c.id].length === 0 && (
                    <div className="border-border/60 text-muted-foreground rounded-md border border-dashed p-3 text-center text-[10px]">
                      Drop tasks here.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : view === "sprints" ? (
          <SprintsView projectId={project?.id || ""} />
        ) : (
          <div className="space-y-1.5 px-6 py-5">
            {tasks?.map((t) => (
              <div
                key={t.id}
                className="border-border bg-card flex items-center gap-3 rounded-md border p-2.5 text-sm"
              >
                <TaskStatusBadge status={t.status} />
                <Link href={`/tasks/${t.id}`} className="flex-1 truncate hover:underline">{t.title}</Link>
                <TaskPriorityBadge priority={t.priority} />
                <span className="text-muted-foreground font-mono text-[10px]">{t.assignee}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <TaskEditorDialog open={editorOpen} onOpenChange={setEditorOpen} task={editingTask} />
    </>
  );
}
