"use client";

import { useState } from "react";
import { ChevronDown, Trash2, X } from "lucide-react";
import type { Spec, Sprint, Task, TaskPriority, TaskStatus } from "@/lib/db/schema";
import type { Assignee } from "@/lib/db/schema";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  ASSIGNEES,
  priorityMeta,
  taskStatusLabel,
} from "@/lib/workflow";
import {
  Dialog,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TagInput } from "@/components/brain/tag-input";

interface TaskDetailProps {
  task: Task;
  specs: Spec[];
  sprints: Sprint[];
  onClose: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function SelectMenu({
  trigger,
  children,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full">
        <Button variant="outline" size="sm" className="w-full justify-between">
          {trigger}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 w-56 overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskDetail({
  task,
  specs,
  sprints,
  onClose,
  onPatch,
  onDelete,
}: TaskDetailProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);

  const spec = task.specId
    ? specs.find((s) => s.id === task.specId)
    : undefined;
  const sprint = task.sprintId
    ? sprints.find((s) => s.id === task.sprintId)
    : undefined;
  const priority = priorityMeta(task.priority);

  return (
    <Dialog open onOpenChange={onClose} className="max-w-2xl" showClose={false}>
      <DialogHeader>
        <div className="flex items-start gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== task.title && onPatch({ title })}
            placeholder="Task title"
            className="text-base font-semibold"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete task"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() =>
              description !== task.description && onPatch({ description })
            }
            placeholder="What needs to be done?"
            rows={3}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <SelectMenu trigger={taskStatusLabel(task.status)}>
              {TASK_STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  active={s.value === task.status}
                  onSelect={() => onPatch({ status: s.value as TaskStatus })}
                >
                  {s.label}
                </DropdownMenuItem>
              ))}
            </SelectMenu>
          </Field>

          <Field label="Priority">
            <SelectMenu
              trigger={<Badge className={priority.badge}>{priority.label}</Badge>}
            >
              {TASK_PRIORITIES.map((p) => (
                <DropdownMenuItem
                  key={p.value}
                  active={p.value === task.priority}
                  onSelect={() =>
                    onPatch({ priority: p.value as TaskPriority })
                  }
                >
                  <Badge className={p.badge}>{p.label}</Badge>
                </DropdownMenuItem>
              ))}
            </SelectMenu>
          </Field>

          <Field label="Assignee">
            <SelectMenu trigger={<span className="capitalize">{task.assignee}</span>}>
              {ASSIGNEES.map((a) => (
                <DropdownMenuItem
                  key={a}
                  active={a === task.assignee}
                  onSelect={() => onPatch({ assignee: a as Assignee })}
                >
                  <span className="capitalize">{a}</span>
                </DropdownMenuItem>
              ))}
            </SelectMenu>
          </Field>

          <Field label="Spec">
            <SelectMenu trigger={spec ? spec.number : "None"}>
              <DropdownMenuItem
                active={!task.specId}
                onSelect={() => onPatch({ specId: null })}
              >
                None
              </DropdownMenuItem>
              {specs.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  active={s.id === task.specId}
                  onSelect={() => onPatch({ specId: s.id })}
                >
                  <span className="font-mono text-xs">{s.number}</span>
                  <span className="truncate">{s.title}</span>
                </DropdownMenuItem>
              ))}
            </SelectMenu>
          </Field>

          <Field label="Sprint">
            <SelectMenu trigger={sprint ? sprint.name : "None"}>
              <DropdownMenuItem
                active={!task.sprintId}
                onSelect={() => onPatch({ sprintId: null })}
              >
                None
              </DropdownMenuItem>
              {sprints.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  active={s.id === task.sprintId}
                  onSelect={() => onPatch({ sprintId: s.id })}
                >
                  <span className="truncate">{s.name}</span>
                </DropdownMenuItem>
              ))}
            </SelectMenu>
          </Field>

          <Field label={`Progress · ${task.progress}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={task.progress}
              onChange={(e) => onPatch({ progress: Number(e.target.value) })}
              className="h-9 w-full accent-[var(--primary)]"
            />
          </Field>
        </div>

        <Field label="Tags">
          <TagInput
            value={task.tags}
            onChange={(tags) => onPatch({ tags })}
          />
        </Field>
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
