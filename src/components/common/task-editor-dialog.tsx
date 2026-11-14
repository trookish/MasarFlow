"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ListTodo, Sparkles, Trash2, Plus } from "lucide-react";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useTasks } from "@/lib/db/repos/misc";
import {
  getDb,
  TASK_STATUS,
  TASK_PRIORITY,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type Spec,
} from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { toast } from "sonner";

interface TaskEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec?: Spec;
  task?: Task;
  onCreated?: (id: string) => void;
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

export function TaskEditorDialog({
  open,
  onOpenChange,
  spec,
  task,
  onCreated,
}: TaskEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" key={open ? `open-${task?.id ?? "new"}` : "closed"}>
        <TaskEditorForm spec={spec} task={task} onOpenChange={onOpenChange} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}

function TaskEditorForm({
  spec,
  task,
  onOpenChange,
  onCreated,
}: {
  spec?: Spec;
  task?: Task;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const project = useActiveProject();
  const projectTasks = useTasks(project?.id);
  const [title, setTitle] = React.useState(task ? task.title : "");
  const [description, setDescription] = React.useState(task ? task.description : "");
  const [status, setStatus] = React.useState<TaskStatus>(task ? task.status : "todo");
  const [priority, setPriority] = React.useState<TaskPriority>(task ? task.priority : "medium");
  const [assignee, setAssignee] = React.useState<Task["assignee"]>(
    task ? task.assignee : "programmer",
  );
  const [progress, setProgress] = React.useState(task ? task.progress : 0);
  const [tagsStr, setTagsStr] = React.useState(task ? task.tags.join(", ") : "");
  const [dependencies, setDependencies] = React.useState<string[]>(task ? task.dependencies : []);
  const [newDep, setNewDep] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const candidates = (projectTasks ?? []).filter((t) => !task || t.id !== task.id);

  const onSave = async () => {
    if (!project) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    const now = Date.now();
    const tags = tagsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const record: Task = {
      id: task?.id ?? uid("task"),
      projectId: project.id,
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      assignee,
      specId: task?.specId ?? spec?.id ?? null,
      parentTaskId: task?.parentTaskId ?? null,
      sprintId: task?.sprintId ?? null,
      dependencies,
      progress,
      tags,
      createdAt: task?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await getDb().tasks.put(record);
      toast.success(task ? "Task updated" : "Task created");
      onOpenChange(false);
      if (!task && onCreated) onCreated(record.id);
    } catch (e) {
      toast.error("Failed to save", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!task) return;
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try {
      await getDb().tasks.delete(task.id);
      toast.success("Task deleted");
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to delete", { description: (e as Error).message });
    }
  };

  const addDep = () => {
    const v = newDep.trim();
    if (!v) return;
    if (dependencies.includes(v)) return;
    setDependencies([...dependencies, v]);
    setNewDep("");
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ListTodo className="h-4 w-4" />
          {task ? "Edit task" : "New task"}
        </DialogTitle>
        <DialogDescription>
          {spec ? `Linked to ${spec.number} — ${spec.title}` : "Standalone task"}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Title</label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Bake surface manifest tool"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Acceptance criteria, implementation notes…"
            className="border-border bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm capitalize"
            >
              {TASK_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm capitalize"
            >
              {TASK_PRIORITY.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Assignee</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value as Task["assignee"])}
              className="border-border bg-background h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="human">Human</option>
              <option value="ai">AI</option>
              <option value="architect">Architect</option>
              <option value="programmer">Programmer</option>
              <option value="reviewer">Reviewer</option>
              <option value="tester">Tester</option>
              <option value="documenter">Documenter</option>
              <option value="designer">Designer</option>
              <option value="optimizer">Optimizer</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Progress: {progress}%</label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="accent-primary w-full"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Tags (comma-separated)</label>
          <Input
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="unity, arch, perf"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Dependencies</label>
          {dependencies.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {dependencies.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1 font-mono text-[10px]">
                  {d}
                  <button
                    onClick={() => setDependencies(dependencies.filter((x) => x !== d))}
                    className="ml-0.5 hover:text-[color:var(--danger)]"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Input
              value={newDep}
              onChange={(e) => setNewDep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDep();
                }
              }}
              placeholder="task_id"
              className="font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={addDep} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {candidates.length > 0 && (
            <div className="border-border bg-surface-2 mt-1.5 max-h-32 overflow-y-auto rounded-md border">
              {candidates.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    if (!dependencies.includes(c.id)) setDependencies([...dependencies, c.id]);
                  }}
                  className="hover:bg-accent/50 flex w-full items-center gap-2 px-2 py-1 text-left text-[11px]"
                >
                  <span className="text-muted-foreground font-mono">{c.id}</span>
                  <span className="truncate">{c.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="border-border flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            {task && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="gap-1 text-[color:var(--danger)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
            <div className="text-muted-foreground inline-flex items-center gap-1.5 text-[11px]">
              <Sparkles className="h-3 w-3 text-[color:var(--primary)]" />
              AI agents see this when planning.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={submitting}>
              {submitting ? "Saving…" : task ? "Save changes" : "Create task"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
