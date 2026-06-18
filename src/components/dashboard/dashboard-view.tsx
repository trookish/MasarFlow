"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  PenTool,
  FileText,
  KanbanSquare,
  ShieldCheck,
  Brain,
  GitCommitHorizontal,
} from "lucide-react";
import {
  notesRepo,
  specsRepo,
  tasksRepo,
  standardsRepo,
  memoriesRepo,
  commitsRepo,
  devLogsRepo,
} from "@/lib/db/repos";
import { useActiveProjectId, useActiveProject } from "@/lib/hooks/use-project";
import type { TaskStatus } from "@/lib/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

function Ring({ value, label }: { value: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth="7"
          />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            className="stroke-primary transition-[stroke-dashoffset] duration-700"
            strokeWidth="7"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ strokeLinecap: "round" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold">
          {Math.round(value)}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof PenTool;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

export function DashboardView() {
  const projectId = useActiveProjectId();
  const project = useActiveProject();

  const notes = useLiveQuery(
    () => notesRepo.listByProject(projectId),
    [projectId],
  );
  const specs = useLiveQuery(
    () => specsRepo.listByProject(projectId),
    [projectId],
  );
  const tasks = useLiveQuery(
    () => tasksRepo.listByProject(projectId),
    [projectId],
  );
  const standards = useLiveQuery(
    () => standardsRepo.listByProject(projectId),
    [projectId],
  );
  const memories = useLiveQuery(
    () => memoriesRepo.listByProject(projectId),
    [projectId],
  );
  const commits = useLiveQuery(
    () => commitsRepo.listByProject(projectId),
    [projectId],
  );
  const devLogs = useLiveQuery(
    () => devLogsRepo.listByProject(projectId),
    [projectId],
  );

  const taskList = tasks ?? [];
  const statusCounts = (
    ["backlog", "todo", "in_progress", "review", "done"] as TaskStatus[]
  ).map((s) => ({
    status: s,
    count: taskList.filter((t) => t.status === s).length,
  }));

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold">
            {project?.name ?? "Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {project?.description || "Project overview and health."}
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-around gap-6 p-6">
            <Ring value={project?.health ?? 0} label="Health" />
            <Ring value={project?.archScore ?? 0} label="Architecture" />
            <Ring value={project?.techDebt ?? 0} label="Tech debt" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={PenTool} label="Notes" value={notes?.length ?? 0} />
          <StatCard icon={FileText} label="Specs" value={specs?.length ?? 0} />
          <StatCard icon={KanbanSquare} label="Tasks" value={taskList.length} />
          <StatCard
            icon={ShieldCheck}
            label="Standards"
            value={standards?.length ?? 0}
          />
          <StatCard
            icon={Brain}
            label="Memories"
            value={memories?.length ?? 0}
          />
          <StatCard
            icon={GitCommitHorizontal}
            label="Commits"
            value={commits?.length ?? 0}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Task pipeline</h2>
              <div className="space-y-2">
                {statusCounts.map(({ status, count }) => {
                  const pct = taskList.length
                    ? (count / taskList.length) * 100
                    : 0;
                  return (
                    <div key={status}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {STATUS_LABEL[status]}
                        </span>
                        <span className="tabular-nums">{count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full bg-primary")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
              {(devLogs ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No activity yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(devLogs ?? []).slice(0, 6).map((log) => (
                    <li key={log.id} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0">
                        {log.type}
                      </Badge>
                      <div className="min-w-0">
                        <div className="truncate text-sm">{log.title}</div>
                        {log.body ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {log.body}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
