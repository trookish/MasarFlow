"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown, Flag, Plus, Trash2 } from "lucide-react";
import { sprintsRepo, tasksRepo } from "@/lib/db/repos";
import type { Sprint, Task } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { taskStatusLabel } from "@/lib/workflow";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type SprintStatus = Sprint["status"];

const SPRINT_STATUS: Record<SprintStatus, { label: string; badge: string }> = {
  planned: { label: "Planned", badge: "bg-muted text-muted-foreground" },
  active: { label: "Active", badge: "bg-primary/15 text-primary" },
  completed: { label: "Completed", badge: "bg-success/15 text-success" },
};

/** Priority-weighted "story points" (no dedicated field on tasks). */
const POINT_WEIGHT: Record<Task["priority"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 5,
};
function points(list: Task[]): number {
  return list.reduce((sum, t) => sum + (POINT_WEIGHT[t.priority] ?? 1), 0);
}

function toInputDate(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}
function fromInputDate(value: string): number | null {
  return value ? new Date(value).getTime() : null;
}

export function SprintsView() {
  const projectId = useActiveProjectId();
  const { showCompleted, velocityDisplay } = usePageSettings((s) => s.sprints);
  const sprintsRaw =
    useLiveQuery(() => sprintsRepo.listByProject(projectId), [projectId]) ?? [];
  const sprints = useMemo(
    () =>
      showCompleted
        ? sprintsRaw
        : sprintsRaw.filter((s) => s.status !== "completed"),
    [sprintsRaw, showCompleted],
  );
  const tasksRaw = useLiveQuery(
    () => tasksRepo.listByProject(projectId),
    [projectId],
  );
  const tasks = useMemo(() => tasksRaw ?? [], [tasksRaw]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = sprints.find((s) => s.id === selectedId) ?? null;
  const tasksBySprint = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.sprintId) continue;
      const list = map.get(t.sprintId) ?? [];
      list.push(t);
      map.set(t.sprintId, list);
    }
    return map;
  }, [tasks]);

  async function createSprint() {
    if (!projectId) return;
    const sprint = await sprintsRepo.create({
      projectId,
      name: `Sprint ${sprints.length + 1}`,
    });
    setSelectedId(sprint.id);
  }

  async function deleteSprint(id: string) {
    await sprintsRepo.remove(id);
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border p-2">
          <span className="px-1 text-sm font-medium">Sprints</span>
          <Button
            size="icon-sm"
            aria-label="New sprint"
            onClick={createSprint}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          {sprints.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No sprints yet.
            </p>
          ) : (
            sprints.map((s) => {
              const meta = SPRINT_STATUS[s.status];
              const list = tasksBySprint.get(s.id) ?? [];
              const doneList = list.filter((t) => t.status === "done");
              const tasksLabel = `${doneList.length}/${list.length} tasks`;
              const pointsLabel = `${points(doneList)}/${points(list)} pts`;
              const velocity =
                velocityDisplay === "tasks"
                  ? tasksLabel
                  : velocityDisplay === "points"
                    ? pointsLabel
                    : `${tasksLabel} · ${pointsLabel}`;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "mb-1 w-full rounded-md border px-3 py-2 text-left",
                    s.id === selectedId
                      ? "border-border bg-accent"
                      : "border-transparent hover:bg-accent/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-medium">
                      {s.name}
                    </span>
                    <Badge className={meta.badge}>{meta.label}</Badge>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {velocity} done
                  </div>
                </button>
              );
            })
          )}
        </ScrollArea>
      </div>

      <div className="min-w-0 flex-1">
        {selected ? (
          <SprintDetail
            key={selected.id}
            sprint={selected}
            tasks={tasks}
            onDelete={() => deleteSprint(selected.id)}
          />
        ) : (
          <EmptyState
            icon={Flag}
            title="No sprint selected"
            description="Group tasks into time-boxed sprints to plan and track milestones."
            action={
              <Button onClick={createSprint} disabled={!projectId}>
                <Plus className="h-4 w-4" /> New sprint
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

function SprintDetail({
  sprint,
  tasks,
  onDelete,
}: {
  sprint: Sprint;
  tasks: Task[];
  onDelete: () => void;
}) {
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal);
  const meta = SPRINT_STATUS[sprint.status];
  const assigned = tasks.filter((t) => t.sprintId === sprint.id);

  function save(patch: Partial<Sprint>) {
    void sprintsRepo.update(sprint.id, patch);
  }

  function toggleTask(task: Task) {
    void tasksRepo.update(task.id, {
      sprintId: task.sprintId === sprint.id ? null : sprint.id,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== sprint.name && save({ name })}
            className="text-base font-semibold"
            placeholder="Sprint name"
          />
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm">
                <Badge className={meta.badge}>{meta.label}</Badge>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(SPRINT_STATUS) as SprintStatus[]).map((st) => (
                <DropdownMenuItem
                  key={st}
                  active={st === sprint.status}
                  onSelect={() => save({ status: st })}
                >
                  <Badge className={SPRINT_STATUS[st].badge}>
                    {SPRINT_STATUS[st].label}
                  </Badge>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete sprint"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Start
            <Input
              type="date"
              defaultValue={toInputDate(sprint.startDate)}
              onChange={(e) =>
                save({ startDate: fromInputDate(e.target.value) })
              }
              className="h-8 w-40"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            End
            <Input
              type="date"
              defaultValue={toInputDate(sprint.endDate)}
              onChange={(e) => save({ endDate: fromInputDate(e.target.value) })}
              className="h-8 w-40"
            />
          </label>
        </div>
        <Textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onBlur={() => goal !== sprint.goal && save({ goal })}
          placeholder="Sprint goal"
          rows={2}
        />
      </div>

      <ScrollArea className="flex-1 px-5 py-4">
        <div className="mx-auto max-w-2xl space-y-2">
          <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Tasks ({assigned.length} in sprint)
          </h3>
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">
              No tasks in this project yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {tasks.map((t) => {
                const inSprint = t.sprintId === sprint.id;
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex-1 truncate">{t.title}</span>
                    <Badge variant="outline">{taskStatusLabel(t.status)}</Badge>
                    <Button
                      variant={inSprint ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => toggleTask(t)}
                    >
                      {inSprint ? "Remove" : "Add"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
