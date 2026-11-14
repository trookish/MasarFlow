"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Info, Trash2, X } from "lucide-react";
import type { Spec, Sprint, Task, TaskPriority, TaskStatus } from "@/lib/db/schema";
import type { Assignee } from "@/lib/db/schema";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  priorityMeta,
  taskStatusLabel,
} from "@/lib/workflow";
import { TASK_ASSIGNEES, assigneeLabel } from "@/lib/domain/task-model";
import { dayKey, parseDayKey } from "@/lib/today/model";
import { clearTaskDue, setTaskDue } from "@/lib/today/tasks";
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
import { BacklinksSection } from "@/components/entities/backlinks-section";
import { PropertiesPanel } from "@/components/vault/properties-panel";

interface TaskEditorProps {
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

/**
 * The task editor shown in the Inspector (a side peek, not a modal), so the board stays visible and
 * interactive while a task is edited. `onClose` clears the selection.
 */
export function TaskEditor({
  task,
  specs,
  sprints,
  onClose,
  onPatch,
  onDelete,
}: TaskEditorProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [advanced, setAdvanced] = useState(false);

  const spec = task.specId
    ? specs.find((s) => s.id === task.specId)
    : undefined;
  const sprint = task.sprintId
    ? sprints.find((s) => s.id === task.sprintId)
    : undefined;
  const priority = priorityMeta(task.priority);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="task-editor">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
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
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
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
            <SelectMenu trigger={assigneeLabel(task.assignee)}>
              {TASK_ASSIGNEES.map((a) => (
                <DropdownMenuItem
                  key={a.value}
                  active={a.value === "human" ? task.assignee === "human" : task.assignee !== "human"}
                  onSelect={() => onPatch({ assignee: a.value as Assignee })}
                >
                  {a.label}
                </DropdownMenuItem>
              ))}
            </SelectMenu>
          </Field>

          <Field label="Due date">
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                aria-label="Due date"
                data-testid="task-due-date"
                value={task.dueDate !== null ? dayKey(task.dueDate) : ""}
                onChange={(e) => {
                  const day = parseDayKey(e.target.value);
                  void (day === null ? clearTaskDue(task.id) : setTaskDue(task.id, day));
                }}
                className="h-8"
              />
              {task.dueDate !== null && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Clear due date"
                  title="Clear due date"
                  onClick={() => void clearTaskDue(task.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
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
            <div
              className="flex h-8 items-center gap-2"
              title="Progress follows the status. A task with subtasks shows the average of its subtasks."
            >
              <div
                role="progressbar"
                aria-label="Task progress"
                aria-valuenow={task.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${task.progress}%` }} />
              </div>
              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </div>
          </Field>
        </div>

        <Field label="Tags">
          <TagInput
            value={task.tags}
            onChange={(tags) => onPatch({ tags })}
          />
        </Field>

        {/* Entity connections (knowledge graph) */}
        <BacklinksSection
          projectId={task.projectId}
          entity={{ kind: "task", id: task.id }}
        />

        {/* Folder-sync properties and tracker references: rarely edited by hand. */}
        <div className="rounded-md border border-border">
          <button
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {advanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Advanced
            <span className="font-normal">· file properties and external reference</span>
          </button>
          {advanced && (
            <div className="space-y-3 border-t border-border px-3 py-3">
              <Field label="External reference">
                <Input
                  defaultValue={task.externalRef}
                  placeholder="github:owner/repo#42"
                  onBlur={(e) => e.target.value !== task.externalRef && onPatch({ externalRef: e.target.value })}
                  className="h-8 font-mono text-xs"
                />
              </Field>
              <PropertiesPanel
                props={task.props}
                onChange={(props) => onPatch({ props })}
                entityId={task.id}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
