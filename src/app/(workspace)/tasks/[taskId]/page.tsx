/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LayoutGrid, ListTodo, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useTask } from "@/lib/db/repos/misc";
import { useSprints } from "@/lib/db/repos/sprints";
import { useActiveProject } from "@/lib/db/repos/projects";
import { getDb, TASK_STATUS, TASK_PRIORITY, type Task } from "@/lib/db/schema";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = typeof params.taskId === "string" ? params.taskId : undefined;
  const project = useActiveProject();
  const task = useTask(taskId);
  const sprints = useSprints(project?.id);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setProgress(task.progress);
    }
  }, [task]);

  const onSave = async () => {
    if (!task || !title.trim()) return;
    await getDb().tasks.update(task.id, {
      title: title.trim(),
      description,
      progress,
      updatedAt: Date.now(),
    });
    toast.success("Task updated");
  };

  const updateField = async <K extends keyof Task>(field: K, value: Task[K]) => {
    if (!task) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getDb().tasks.update(task.id, { [field]: value, updatedAt: Date.now() } as any);
    toast.success("Task updated");
  };

  if (task === null) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-muted-foreground text-sm">Task not found.</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-muted-foreground text-sm">Loading task...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="px-6 pt-4 shrink-0">
        <Link
          href="/tasks"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Tasks
        </Link>
      </div>

      <div className="shrink-0">
        <PageHeader
          icon={ListTodo}
          eyebrow="Tasks / Detail"
          title={task.title}
          actions={
            <Button onClick={onSave} size="sm">
              Save Changes
            </Button>
          }
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Core Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    Title
                  </label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    Description
                  </label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[200px]"
                    placeholder="Provide details about this task..."
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Progress ({progress}%)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="flex-1"
                  />
                  <div className="bg-muted text-muted-foreground w-12 rounded px-2 py-1 text-center font-mono text-xs">
                    {progress}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Properties</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    Status
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={task.status}
                    onChange={(e) => updateField("status", e.target.value as Task["status"])}
                  >
                    {TASK_STATUS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    Priority
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={task.priority}
                    onChange={(e) => updateField("priority", e.target.value as Task["priority"])}
                  >
                    {TASK_PRIORITY.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" /> Sprint
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={task.sprintId || "none"}
                    onChange={(e) => updateField("sprintId", e.target.value === "none" ? null : e.target.value)}
                  >
                    <option value="none">Backlog (No Sprint)</option>
                    {sprints?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    Assignee
                  </label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={task.assignee}
                    onChange={(e) => updateField("assignee", e.target.value as Task["assignee"])}
                  >
                    <option value="human">Human</option>
                    <option value="ai">AI</option>
                    <option value="architect">Architect</option>
                    <option value="programmer">Programmer</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Meta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-mono">{formatRelativeTime(task.createdAt)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="font-mono">{formatRelativeTime(task.updatedAt)}</span>
                </div>
                {task.specId && (
                  <div className="pt-2">
                    <Link
                      href={`/specs/${task.specId}`}
                      className="flex items-center gap-2 text-sm text-[color:var(--primary)] hover:underline"
                    >
                      <LayoutGrid className="h-4 w-4" /> View Linked Spec
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
