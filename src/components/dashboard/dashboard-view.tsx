"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  PenTool,
  FileText,
  KanbanSquare,
  ShieldCheck,
  Brain,
  GitCommitHorizontal,
  ArrowRight,
  Boxes,
  Flag,
  MessageSquare,
  BookOpen,
  Layers,
  Plus,
  Sparkles,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import {
  notesRepo,
  specsRepo,
  tasksRepo,
  standardsRepo,
  memoriesRepo,
  commitsRepo,
  devLogsRepo,
  syncRepo,
  systemsRepo,
  sprintsRepo,
  docsRepo,
} from "@/lib/db/repos";
import { computeProjectMetrics } from "@/lib/metrics";
import { useActiveProjectId, useActiveProject } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { ProjectIcon } from "@/components/shell/project-fields";
import type { TaskStatus, Task } from "@/lib/db/schema";
import { NOTE_TYPE_DOT } from "@/lib/colors";
import { taskStatusLabel, priorityMeta, specStatusMeta } from "@/lib/workflow";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GithubCommitsCard } from "./commits-panel";

/* ── Small helpers ────────────────────────────────────────────────────── */

function relTime(ts: number): string {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function Ring({
  value,
  label,
  hint,
}: {
  value: number | null;
  label: string;
  hint?: string;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const finite = value !== null && Number.isFinite(value);
  const offset = finite
    ? c * (1 - Math.max(0, Math.min(100, value as number)) / 100)
    : c;
  return (
    <div className="flex flex-col items-center gap-2" title={hint}>
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
          {finite ? Math.round(value as number) : "—"}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

/** One compact count tile linking straight to its module. */
function StatTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </Link>
  );
}

/** Shared card shell: title row with icon and a "view all" link. */
function DashCard({
  icon: Icon,
  title,
  href,
  hrefLabel = "View all",
  children,
}: {
  icon: LucideIcon;
  title: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col">
      <CardContent className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{title}</h2>
          {href && (
            <Link
              href={href}
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              {hrefLabel} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center py-6 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  backlog: "bg-muted text-muted-foreground",
  todo: "bg-node-system/15 text-node-system",
  in_progress: "bg-node-idea/15 text-node-idea",
  review: "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
};

/* ── Dashboard ────────────────────────────────────────────────────────── */

export function DashboardView() {
  const projectId = useActiveProjectId();
  const project = useActiveProject();
  const router = useRouter();
  const { showMetrics, showActivity } = usePageSettings((s) => s.dashboard);

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
  const syncFiles = useLiveQuery(
    () => syncRepo.listByProject(projectId),
    [projectId],
  );
  const systems = useLiveQuery(
    () => systemsRepo.listByProject(projectId),
    [projectId],
  );
  const sprints = useLiveQuery(
    () => sprintsRepo.listByProject(projectId),
    [projectId],
  );
  const docs = useLiveQuery(
    () => docsRepo.listByProject(projectId),
    [projectId],
  );

  // Live metrics computed from real workspace data (no stored scores).
  const metrics = computeProjectMetrics({
    tasks: tasks ?? [],
    specs: specs ?? [],
    systems: systems ?? [],
    standards: standards ?? [],
    notes: notes ?? [],
  });

  const taskList = tasks ?? [];
  const filesCount = (syncFiles ?? []).filter((f) =>
    f.entityId?.startsWith("attachment:"),
  ).length;

  // "What am I working on": active statuses first, urgent → low within each.
  const statusRank: Record<TaskStatus, number> = {
    in_progress: 0,
    review: 1,
    todo: 2,
    backlog: 3,
    done: 4,
  };
  const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
  const activeTasks = taskList
    .filter((t) => t.status !== "done" && t.status !== "backlog")
    .sort(
      (a, b) =>
        statusRank[a.status] - statusRank[b.status] ||
        priorityRank[a.priority] - priorityRank[b.priority] ||
        b.updatedAt - a.updatedAt,
    )
    .slice(0, 6);

  const specsInFlight = (specs ?? [])
    .filter((s) => s.status !== "shipped")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);

  const recentNotes = [...(notes ?? [])]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  const activeSprint =
    (sprints ?? []).find((s) => s.status === "active") ?? null;

  const statusCounts = (
    ["backlog", "todo", "in_progress", "review", "done"] as TaskStatus[]
  ).map((s) => ({
    status: s,
    count: taskList.filter((t) => t.status === s).length,
  }));

  const isEmptyWorkspace =
    (notes?.length ?? 0) === 0 &&
    (specs?.length ?? 0) === 0 &&
    taskList.length === 0;

  async function newNote() {
    if (!projectId) return;
    const note = await notesRepo.create({ projectId, title: "Untitled note" });
    router.push(`/brain?note=${note.id}`);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ScrollArea className="flex-1 px-6 py-6">
        <div className="mx-auto max-w-6xl space-y-5">
          {/* Project banner (header mode) */}
          {project?.banner && project.bannerMode === "banner" ? (
            <div className="relative h-40 overflow-hidden rounded-xl border border-border">
              <img
                src={project.banner}
                alt={`${project.name} banner`}
                draggable={false}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          {/* Header + quick actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-56 flex-1 items-center gap-3">
              <ProjectIcon
                icon={project?.icon}
                iconImage={project?.iconImage}
                accent={project?.accent}
                size="lg"
              />
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold">
                  {project?.name ?? "Dashboard"}
                </h1>
                <p className="truncate text-sm text-muted-foreground">
                  {project?.description || "Project overview and health."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void newNote()}
                disabled={!projectId}
              >
                <Plus className="h-3.5 w-3.5" /> New note
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/tasks")}
              >
                <KanbanSquare className="h-3.5 w-3.5" /> New task
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/specs")}
              >
                <FileText className="h-3.5 w-3.5" /> New spec
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/chat")}
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Ask AI
              </Button>
            </div>
          </div>

          {/* First-run hero */}
          {isEmptyWorkspace && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <Sparkles className="h-6 w-6 text-primary" />
                <h2 className="text-base font-semibold">
                  Your workspace is empty — give it a first path
                </h2>
                <p className="max-w-lg text-sm text-muted-foreground">
                  Capture an idea as a note, promote it to a spec, break it into
                  tasks — or open the AI chat and ask it to do all of that for
                  you. It sees everything in this workspace and can create
                  notes, specs, and tasks directly.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => void newNote()}
                    disabled={!projectId}
                  >
                    <PenTool className="h-3.5 w-3.5" /> Write a note
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/workflow")}
                  >
                    Run the 16-step workflow
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/chat")}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> Ask AI
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Health rings */}
          {showMetrics && !isEmptyWorkspace && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-around gap-6 p-5">
                <Ring
                  value={metrics.health}
                  label="Health"
                  hint="60% task completion + 40% spec progress, minus open urgent work"
                />
                <Ring
                  value={metrics.archScore}
                  label="Architecture"
                  hint="Average health of catalogued systems, minus deprecated dependencies"
                />
                <Ring
                  value={metrics.techDebt}
                  label="Tech debt"
                  hint="Standards violations density + share of pressing open tasks (lower is better)"
                />
              </CardContent>
            </Card>
          )}

          {/* Counts strip — every tile goes straight to its module */}
          <div className="flex flex-wrap gap-2">
            <StatTile
              icon={PenTool}
              label="Notes"
              value={notes?.length ?? 0}
              href="/brain"
            />
            <StatTile
              icon={FileText}
              label="Specs"
              value={specs?.length ?? 0}
              href="/specs"
            />
            <StatTile
              icon={KanbanSquare}
              label="Tasks"
              value={taskList.length}
              href="/tasks"
            />
            <StatTile
              icon={Flag}
              label="Sprints"
              value={sprints?.length ?? 0}
              href="/sprints"
            />
            <StatTile
              icon={ShieldCheck}
              label="Standards"
              value={standards?.length ?? 0}
              href="/standards"
            />
            <StatTile
              icon={BookOpen}
              label="Docs"
              value={docs?.length ?? 0}
              href="/docs"
            />
            <StatTile
              icon={Boxes}
              label="Systems"
              value={systems?.length ?? 0}
              href="/architecture"
            />
            <StatTile
              icon={Brain}
              label="Memories"
              value={memories?.length ?? 0}
              href="/knowledge"
            />
            <StatTile
              icon={Layers}
              label="Files"
              value={filesCount}
              href="/files"
            />
          </div>

          {/* Work grid */}
          <div className="grid gap-4 lg:grid-cols-2">
            <DashCard
              icon={KanbanSquare}
              title="Active work"
              href="/tasks"
              hrefLabel="Open board"
            >
              {activeTasks.length === 0 ? (
                <EmptyHint>
                  Nothing in flight. Move a task to “To do” or “In progress” on
                  the board.
                </EmptyHint>
              ) : (
                <ul className="space-y-1.5">
                  {activeTasks.map((t: Task) => (
                    <li key={t.id}>
                      <Link
                        href={`/tasks?task=${t.id}`}
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent/50"
                      >
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            STATUS_BADGE[t.status],
                          )}
                        >
                          {taskStatusLabel(t.status)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm group-hover:text-foreground">
                          {t.title}
                        </span>
                        {(t.priority === "urgent" || t.priority === "high") && (
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px]",
                              priorityMeta(t.priority).badge,
                            )}
                          >
                            {priorityMeta(t.priority).label}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </DashCard>

            <DashCard icon={FileText} title="Specs in flight" href="/specs">
              {specsInFlight.length === 0 ? (
                <EmptyHint>
                  No open specifications. Promote a note or ask the AI to draft
                  one.
                </EmptyHint>
              ) : (
                <ul className="space-y-2">
                  {specsInFlight.map((s) => {
                    const meta = specStatusMeta(s.status);
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/specs?spec=${s.id}`}
                          className="group block rounded-md px-2 py-1.5 -mx-2 hover:bg-accent/50"
                        >
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {s.number}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {s.title}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                meta.badge,
                              )}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${s.implementationProgress}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {s.implementationProgress}%
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashCard>

            <DashCard
              icon={PenTool}
              title="Recent notes"
              href="/brain"
              hrefLabel="Open Brain"
            >
              {recentNotes.length === 0 ? (
                <EmptyHint>No notes yet — capture your first idea.</EmptyHint>
              ) : (
                <ul className="space-y-1.5">
                  {recentNotes.map((n) => (
                    <li key={n.id}>
                      <Link
                        href={`/brain?note=${n.id}`}
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent/50"
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            NOTE_TYPE_DOT[n.type],
                          )}
                        />
                        <span className="min-w-0 truncate text-sm">
                          {n.title || "Untitled"}
                        </span>
                        {n.excerpt && (
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {n.excerpt}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {relTime(n.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </DashCard>

            <DashCard
              icon={Flag}
              title={
                activeSprint
                  ? `Task pipeline — ${activeSprint.name}`
                  : "Task pipeline"
              }
              href="/sprints"
              hrefLabel="Sprints"
            >
              {taskList.length === 0 ? (
                <EmptyHint>
                  No tasks yet — the pipeline fills in as you plan work.
                </EmptyHint>
              ) : (
                <div className="space-y-2">
                  {statusCounts.map(({ status, count }) => {
                    const pct = taskList.length
                      ? (count / taskList.length) * 100
                      : 0;
                    return (
                      <div key={status}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-muted-foreground">
                            {taskStatusLabel(status)}
                          </span>
                          <span className="tabular-nums">{count}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DashCard>

            <DashCard icon={GitCommitHorizontal} title="GitHub commits">
              <GithubCommitsCard
                projectId={projectId}
                commits={commits ?? []}
                specs={specs ?? []}
              />
            </DashCard>

            {showActivity && (
              <DashCard
                icon={ScrollText}
                title="Recent activity"
                href="/devlogs"
                hrefLabel="Dev Logs"
              >
                {(devLogs ?? []).length === 0 ? (
                  <EmptyHint>
                    No activity yet. Changes, agent actions, and commits land
                    here.
                  </EmptyHint>
                ) : (
                  <ul className="space-y-2">
                    {(devLogs ?? []).slice(0, 6).map((log) => (
                      <li key={log.id} className="flex items-start gap-2">
                        <Badge variant="outline" className="mt-0.5 shrink-0">
                          {log.type}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{log.title}</div>
                          {log.body ? (
                            <div className="truncate text-xs text-muted-foreground">
                              {log.body}
                            </div>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {relTime(log.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DashCard>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
