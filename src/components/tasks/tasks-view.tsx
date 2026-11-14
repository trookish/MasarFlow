"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ChevronDown, Filter, KanbanSquare } from "lucide-react";
import { tasksRepo, specsRepo, sprintsRepo } from "@/lib/db/repos";
import type { Assignee, Task } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { useUrlSelection } from "@/lib/hooks/use-url-selection";
import { useCreateIntent } from "@/lib/hooks/use-create-intent";
import { ASSIGNEES } from "@/lib/workflow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageFrame,
  PageHeader,
  PageStage,
  Toolbar,
  ToolbarGroup,
} from "@/components/page";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TaskBoard } from "./task-board";
import { patchTask as patchTaskRow } from "@/lib/domain/task-actions";
import { pageUrl } from "@/lib/navigation/surfaces";

export function TasksView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const [selectedId, select] = useUrlSelection("/tasks", "task");

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

  const { showCompleted, defaultGroup } = usePageSettings((s) => s.tasks);
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
          (assigneeFilter === "all" || t.assignee === assigneeFilter) &&
          (showCompleted || t.status !== "done"),
      ),
    [allTasks, sprintFilter, assigneeFilter, showCompleted],
  );

  // The dashboard's "New task" action deep-links here with ?new=<nonce>. Each
  // nonce creates at most one task (see lib/navigation/create-intent.ts), so a
  // remount or a dock panel replaying its stale URL can't create duplicates,
  // and a second click (a new nonce) on an open panel still creates one.
  useCreateIntent("/tasks", Boolean(projectId), () =>
    createTask({ status: "todo" }, true),
  );

  async function patchTask(id: string, patch: Partial<Task>) {
    const t = allTasks.find((x) => x.id === id);
    await patchTaskRow({ id, specId: t?.specId ?? null }, patch);
  }

  async function createTask(patch: Partial<Task>, consumeIntent = false) {
    if (!projectId) return;
    const task = await tasksRepo.create({
      projectId,
      title: "New task",
      status: "todo",
      ...patch,
    });
    if (consumeIntent) {
      // select() would merge THIS render's search — which still holds the
      // ?new=<nonce> intent — back into the URL. Replace with the selection
      // alone so the address bar and dock snapshot drop the intent.
      router.replace(pageUrl("/tasks", `task=${task.id}`), { scroll: false });
    } else {
      select(task.id);
    }
  }

  const sprintLabel =
    sprintFilter === "all"
      ? "All sprints"
      : (sprints.find((s) => s.id === sprintFilter)?.name ?? "Sprint");

  const openCount = filtered.filter((t) => t.status !== "done").length;

  return (
    <PageFrame archetype="board">
      <PageHeader
        title="Task Boards"
        icon={KanbanSquare}
        meta={
          <>
            <Badge variant="outline">{openCount} open</Badge>
            {filtered.length !== allTasks.length ? (
              <Badge>{allTasks.length} total</Badge>
            ) : null}
          </>
        }
        description="Drag a card between columns to change its status. Click one to see its properties in the Inspector."
        actions={
          <Button
            size="sm"
            onClick={() => createTask({ status: "todo" })}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" /> New task
          </Button>
        }
      />
      <Toolbar aria-label="Task board filters">
        <ToolbarGroup>
          <Filter
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
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
            <DropdownMenuContent
              align="end"
              className="max-h-72 overflow-y-auto"
            >
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
        </ToolbarGroup>
      </Toolbar>

      <PageStage>
        <TaskBoard
          tasks={filtered}
          specsById={specsById}
          groupBy={defaultGroup}
          selectedId={selectedId}
          onOpen={select}
          onSet={patchTask}
          onCreate={createTask}
        />
      </PageStage>
    </PageFrame>
  );
}
