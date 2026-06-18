"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ChevronDown, Filter } from "lucide-react";
import { tasksRepo, specsRepo, sprintsRepo } from "@/lib/db/repos";
import type { Assignee, Task, TaskStatus } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { ASSIGNEES } from "@/lib/workflow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TaskBoard } from "./task-board";
import { TaskDetail } from "./task-detail";

export function TasksView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("task");

  const tasks = useLiveQuery(
    () => tasksRepo.listByProject(projectId),
    [projectId],
  );
  const specsRaw = useLiveQuery(
    () => specsRepo.listByProject(projectId),
    [projectId],
  );
  const sprints =
    useLiveQuery(() => sprintsRepo.listByProject(projectId), [projectId]) ?? [];
  const specs = useMemo(() => specsRaw ?? [], [specsRaw]);

  const [sprintFilter, setSprintFilter] = useState<string | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<Assignee | "all">("all");

  const specsById = useMemo(
    () => new Map(specs.map((s) => [s.id, s])),
    [specs],
  );
  const allTasks = useMemo(() => tasks ?? [], [tasks]);
  const filtered = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          (sprintFilter === "all" || t.sprintId === sprintFilter) &&
          (assigneeFilter === "all" || t.assignee === assigneeFilter),
      ),
    [allTasks, sprintFilter, assigneeFilter],
  );
  const selectedTask = allTasks.find((t) => t.id === selectedId) ?? null;

  function select(id: string | null) {
    router.replace(id ? `/tasks?task=${id}` : "/tasks", { scroll: false });
  }

  async function recompute(...specIds: (string | null | undefined)[]) {
    for (const id of new Set(specIds.filter((x): x is string => Boolean(x)))) {
      await specsRepo.recomputeProgress(id);
    }
  }

  async function moveTask(id: string, status: TaskStatus) {
    const t = allTasks.find((x) => x.id === id);
    await tasksRepo.update(id, { status });
    await recompute(t?.specId);
  }

  async function patchTask(id: string, patch: Partial<Task>) {
    const t = allTasks.find((x) => x.id === id);
    await tasksRepo.update(id, patch);
    await recompute(t?.specId, patch.specId);
  }

  async function deleteTask(id: string) {
    const t = allTasks.find((x) => x.id === id);
    await tasksRepo.remove(id);
    select(null);
    await recompute(t?.specId);
  }

  async function createTask(status: TaskStatus) {
    if (!projectId) return;
    const task = await tasksRepo.create({
      projectId,
      title: "New task",
      status,
    });
    select(task.id);
  }

  const sprintLabel =
    sprintFilter === "all"
      ? "All sprints"
      : (sprints.find((s) => s.id === sprintFilter)?.name ?? "Sprint");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <h1 className="text-sm font-semibold">Task Boards</h1>
        <div className="ml-auto flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm">
                {sprintLabel}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                active={sprintFilter === "all"}
                onSelect={() => setSprintFilter("all")}
              >
                All sprints
              </DropdownMenuItem>
              {sprints.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  active={sprintFilter === s.id}
                  onSelect={() => setSprintFilter(s.id)}
                >
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm">
                <span className="capitalize">
                  {assigneeFilter === "all" ? "All assignees" : assigneeFilter}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuItem
                active={assigneeFilter === "all"}
                onSelect={() => setAssigneeFilter("all")}
              >
                All assignees
              </DropdownMenuItem>
              {ASSIGNEES.map((a) => (
                <DropdownMenuItem
                  key={a}
                  active={assigneeFilter === a}
                  onSelect={() => setAssigneeFilter(a)}
                >
                  <span className="capitalize">{a}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            onClick={() => createTask("todo")}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <TaskBoard
          tasks={filtered}
          specsById={specsById}
          onOpen={select}
          onMove={moveTask}
          onCreate={createTask}
        />
      </div>

      {selectedTask ? (
        <TaskDetail
          key={selectedTask.id}
          task={selectedTask}
          specs={specs}
          sprints={sprints}
          onClose={() => select(null)}
          onPatch={(patch) => patchTask(selectedTask.id, patch)}
          onDelete={() => deleteTask(selectedTask.id)}
        />
      ) : null}
    </div>
  );
}
