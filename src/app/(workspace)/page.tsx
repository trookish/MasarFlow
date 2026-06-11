"use client";
import * as React from "react";
import Link from "next/link";
import { LayoutDashboard, Sparkles, Activity, GitCommit, Calendar, Bot, ListTodo, FileText, Brain, Boxes, ArrowUpRight, TrendingUp, TrendingDown, Minus, Plus, Zap, Network, ScrollText, AlertCircle, Target } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricRing, TrendBadge } from "@/components/common/metrics";
import { SpecStatusBadge, TaskStatusBadge, TaskPriorityBadge, DevLogKindBadge } from "@/components/common/badges";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSpecs, useAllPlans, useTasksForSpec } from "@/lib/db/repos/specs";
import { useTasks, useDevLogs, useCommits, useAgents, useMemories, useSystems, useArchGraph } from "@/lib/db/repos/misc";
import { useNotes } from "@/lib/db/repos/notes";
import { computeHealth, listCommitsForProject, listRecentActivity, type ProjectHealth } from "@/lib/health";
import { onAutomationEvent, recallMemory, startAutomation } from "@/lib/automation/engine";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelativeTime, pluralize, truncate } from "@/lib/utils";

export default function DashboardPage() {
  const project = useActiveProject();
  const specs = useSpecs(project?.id);
  const tasks = useTasks(project?.id);
  const devLogs = useDevLogs(project?.id);
  const commits = useCommits(project?.id);
  const agents = useAgents();
  const memories = useMemories(project?.id);
  const notes = useNotes(project?.id);
  const systems = useSystems(project?.id);
  const { nodes: archNodes, edges: archEdges } = useArchGraph(project?.id);
  const allPlans = useAllPlans();

  const [health, setHealth] = React.useState<ProjectHealth | null>(null);
  const [recentCommits, setRecentCommits] = React.useState<Awaited<ReturnType<typeof listCommitsForProject>>>([]);
  const [recentActivity, setRecentActivity] = React.useState<Awaited<ReturnType<typeof listRecentActivity>>>([]);
  const [automationEvents, setAutomationEvents] = React.useState<{ id: string; kind: string; message: string; at: number }[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!project) return;
    setRefreshing(true);
    const [h, c, a] = await Promise.all([
      computeHealth(project),
      listCommitsForProject(project.id, 6),
      listRecentActivity(project.id, 8),
    ]);
    setHealth(h);
    setRecentCommits(c);
    setRecentActivity(a);
    setRefreshing(false);
  }, [project]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  React.useEffect(() => {
    return onAutomationEvent((e) => {
      setAutomationEvents((prev) => [e, ...prev].slice(0, 6));
      void refresh();
    });
  }, [refresh]);

  React.useEffect(() => {
    if (memories && memories.length > 0) {
      const top = [...memories].sort((a, b) => b.weight - a.weight).slice(0, 2);
      top.forEach((m) => { void recallMemory(m.id); });
    }
  }, [memories?.length]);

  if (!project) return <DashboardSkeleton />;
  if (!health) return <DashboardSkeleton />;

  const upcomingMilestones = [
    { id: "m1", label: "Vertical slice playable", date: "in 3 weeks", progress: Math.min(100, Math.round((health.specsByStatus["implementing"] ?? 0) * 25 + 30)) },
    { id: "m2", label: "Alpha build", date: "in 6 weeks", progress: Math.round(health.score * 0.5) },
    { id: "m3", label: "Closed beta", date: "in 11 weeks", progress: Math.max(10, Math.round(health.score * 0.2)) },
  ];

  return (
    <div className="pb-10">
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="Dashboard"
        title={"Welcome back, " + (project.name === "Aurora Rising" ? "Tariq" : "developer")}
        description="A live view of your project. Every signal below is derived from your notes, specs, tasks, agents, commits, and memory."
        actions={
          <Button onClick={refresh} variant="soft" size="sm" disabled={refreshing} className="gap-1.5">
            <Activity className={cn("h-3.5 w-3.5", refreshing && "animate-pulse")} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <StatsRow health={health} />
          <div className="grid gap-4 sm:grid-cols-2">
            <HealthCard health={health} projectName={project.name} />
            <GraphCard health={health} />
          </div>
          <PipelineCard health={health} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SpecsList specs={specs ?? []} allPlans={allPlans ?? []} />
            <TasksList tasks={tasks ?? []} />
          </div>
          <RecentCommitsWidget commits={recentCommits} />
        </div>

        <div className="space-y-4 lg:col-span-4">
          <MilestonesCard milestones={upcomingMilestones} />
          <AutomationFeed events={automationEvents} />
          <ActivityFeed activity={recentActivity} />
          <SuggestionsCard />
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-24" />
      <Skeleton className="h-48" />
    </div>
  );
}

function StatsRow({ health }: { health: ProjectHealth }) {
  const stats = [
    { label: "Active Specs", value: (health.specsByStatus["implementing"] ?? 0) + (health.specsByStatus["review"] ?? 0), icon: FileText, color: "var(--graph-spec)", href: "/specs" },
    { label: "Open Tasks", value: health.openTasks, icon: ListTodo, color: "var(--graph-task)", href: "/tasks" },
    { label: "In Progress", value: health.inProgress, icon: Activity, color: "var(--info)", href: "/tasks" },
    { label: "Memory", value: health.memoryCount, icon: Brain, color: "var(--graph-memory)", href: "/brain" },
    { label: "AI Agents", value: 8, icon: Bot, color: "var(--primary)", href: "/agents" },
    { label: "Standards", value: health.standardsEnforced, icon: Target, color: "var(--graph-standard)", href: "/standards" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Link key={s.label} href={s.href} className="group relative flex items-center gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-border/80 hover:bg-accent/30">
            <span className="grid h-7 w-7 place-items-center rounded-md" style={{ backgroundColor: "color-mix(in oklch, " + s.color + " 18%, transparent)", color: s.color }}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold tabular-nums">{s.value}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function HealthCard({ health, projectName }: { health: ProjectHealth; projectName: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardDescription>Project Health</CardDescription>
          <CardTitle className="mt-1 text-lg">{projectName}</CardTitle>
        </div>
        <MetricRing value={health.score} size={48} stroke={4} />
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 pt-0 text-xs">
        <div>
          <div className="text-muted-foreground">Architecture</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums">{health.archScore}</span>
            <TrendBadge delta={4} />
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Tech Debt</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className={cn("text-lg font-semibold tabular-nums", health.techDebt > 50 && "text-[color:var(--danger)]")}>{health.techDebt}</span>
            <TrendBadge delta={-3} />
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Velocity</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums">{health.velocity.toFixed(1)}</span>
            <span className="text-[10px] text-muted-foreground">/day</span>
            {health.trend === "up" && <TrendingUp className="h-3 w-3 text-[color:var(--success)]" />}
            {health.trend === "down" && <TrendingDown className="h-3 w-3 text-[color:var(--danger)]" />}
            {health.trend === "flat" && <Minus className="h-3 w-3 text-muted-foreground" />}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Done</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums">{health.done}</span>
            <span className="text-[10px] text-muted-foreground">tasks</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GraphCard({ health }: { health: ProjectHealth }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardDescription>Preview</CardDescription>
          <CardTitle className="mt-1 text-sm">Knowledge Graph</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/knowledge-graph" className="gap-1">Open <ArrowUpRight className="h-3 w-3" /></Link>
        </Button>
      </CardHeader>
      <CardContent>
        <MiniGraph />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          {[["Note", "var(--graph-note)"], ["Spec", "var(--graph-spec)"], ["Task", "var(--graph-task)"], ["System", "var(--graph-system)"]].map(([l, c]) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} />
              {l}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const MINI_NODES: Array<[number, number, string]> = [[40, 40, "var(--graph-note)"], [120, 30, "var(--graph-spec)"], [220, 30, "var(--graph-spec)"], [60, 120, "var(--graph-task)"], [180, 130, "var(--graph-task)"], [280, 100, "var(--graph-system)"]];
function MiniGraph() {
  return (
    <svg viewBox="0 0 320 160" className="h-40 w-full">
      <defs>
        <radialGradient id="g-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="80" r="50" fill="url(#g-glow)" />
      {MINI_NODES.map(([x, y, c], i) => (
        <g key={i}>
          <line x1={x} y1={y} x2="160" y2="80" stroke="var(--border)" strokeOpacity="0.4" strokeWidth="0.5" />
          <circle cx={String(x)} cy={String(y)} r="4" fill={c} />
        </g>
      ))}
      <circle cx="160" cy="80" r="14" fill="var(--background)" stroke="var(--primary)" strokeWidth="1.5" />
      <text x="160" y="84" textAnchor="middle" fontSize="9" fill="var(--primary)" fontWeight="600">AURORA</text>
    </svg>
  );
}

function PipelineCard({ health }: { health: ProjectHealth }) {
  const steps = [
    { label: "Ideas", count: 12, color: "var(--graph-idea)" },
    { label: "Knowledge", count: health.notesCount, color: "var(--graph-note)" },
    { label: "Specs", count: Object.values(health.specsByStatus).reduce((a, b) => a + b, 0), color: "var(--graph-spec)" },
    { label: "Plans", count: (health.specsByStatus["review"] ?? 0) + (health.specsByStatus["implementing"] ?? 0), color: "var(--graph-memory)" },
    { label: "Tasks", count: health.openTasks + health.done, color: "var(--graph-task)" },
    { label: "Code", count: 247, color: "var(--graph-commit)" },
    { label: "Docs", count: 3, color: "var(--graph-doc)" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardDescription>Flow</CardDescription>
        <CardTitle className="mt-1 text-sm">Implementation pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              <div className="flex min-w-[60px] flex-col items-center rounded-md border border-border p-2" style={{ borderColor: "color-mix(in oklch, " + s.color + " 25%, var(--border))" }}>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: s.color }}>{s.count}</span>
              </div>
              {i < steps.length - 1 && <ArrowUpRight className="h-3 w-3 text-muted-foreground/50" />}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-[color:var(--primary)]" />
          <span>{health.openPlans} plan{health.openPlans === 1 ? "" : "s"} awaiting approval - {health.done} task{health.done === 1 ? "" : "s"} completed</span>
        </div>
      </CardContent>
    </Card>
  );
}

function SpecsList({ specs, allPlans }: { specs: import("@/lib/db/schema").Spec[]; allPlans: import("@/lib/db/schema").Plan[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardDescription>Active specifications</CardDescription>
          <CardTitle className="mt-1 text-sm">In Flight</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild><Link href="/specs">View all</Link></Button>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {specs.slice(0, 4).map((s) => {
          const plan = allPlans.find((p) => p.specId === s.id);
          return (
            <Link key={s.id} href={"/specs/" + s.id} className="block rounded-md border border-border p-3 transition-colors hover:border-border/80 hover:bg-accent/30">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{s.number}</span>
                <SpecStatusBadge status={s.status} />
                {plan && plan.status === "awaiting_approval" && <Badge variant="warning" className="gap-1"><Sparkles className="h-3 w-3" />awaiting</Badge>}
                <span className="ml-auto text-[10px] text-muted-foreground">{formatRelativeTime(s.updatedAt)}</span>
              </div>
              <div className="mt-1 truncate text-sm font-medium">{s.title}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: s.implementationProgress + "%" }} />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{s.implementationProgress}%</span>
              </div>
            </Link>
          );
        })}
        {specs.length === 0 && <div className="text-xs text-muted-foreground">No specs yet.</div>}
      </CardContent>
    </Card>
  );
}

function TasksList({ tasks }: { tasks: import("@/lib/db/schema").Task[] }) {
  const top = tasks.slice(0, 5);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardDescription>Open work</CardDescription>
          <CardTitle className="mt-1 text-sm">Tasks</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild><Link href="/tasks">View all</Link></Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {top.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
            <TaskStatusBadge status={t.status} />
            <span className="flex-1 truncate">{t.title}</span>
            <TaskPriorityBadge priority={t.priority} />
            <span className="font-mono text-[10px] text-muted-foreground">{t.progress}%</span>
          </div>
        ))}
        {tasks.length === 0 && <div className="text-xs text-muted-foreground">No tasks yet.</div>}
      </CardContent>
    </Card>
  );
}

function RecentCommitsWidget({ commits }: { commits: Awaited<ReturnType<typeof listCommitsForProject>> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardDescription className="flex items-center gap-1.5"><GitCommit className="h-3 w-3" /> Git</CardDescription>
          <CardTitle className="mt-1 text-sm">Recent commits</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild><Link href="/dev-logs">All activity</Link></Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {commits.length === 0 && <div className="text-xs text-muted-foreground">No commits yet.</div>}
        {commits.map((c) => (
          <div key={c.id} className="rounded-md border border-border/60 p-2.5">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="ghost" className="font-mono text-[10px]">{c.hash}</Badge>
              <span className="text-muted-foreground">{c.author}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{formatRelativeTime(c.date)}</span>
            </div>
            <div className="mt-1 text-sm">{c.message}</div>
            {c.aiSummary && <div className="mt-1 line-clamp-2 text-[11px] text-pretty text-muted-foreground">{c.aiSummary}</div>}
            {c.files.length > 0 && <div className="mt-1 font-mono text-[10px] text-muted-foreground">{c.files.length} file{c.files.length === 1 ? "" : "s"}</div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MilestonesCard({ milestones }: { milestones: Array<{ id: string; label: string; date: string; progress: number }> }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Roadmap</CardDescription>
        <CardTitle className="mt-1 text-sm">Upcoming milestones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {milestones.map((m) => (
          <div key={m.id} className="rounded-md border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{m.label}</div>
              <Badge variant="ghost" className="gap-1 font-normal"><Calendar className="h-3 w-3" /> {m.date}</Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: m.progress + "%" }} />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{m.progress}%</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AutomationFeed({ events }: { events: { id: string; kind: string; message: string; at: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> Automation</CardDescription>
        <CardTitle className="mt-1 text-sm">Background engine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {events.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
            Engine running every 30s. Recent events will appear here.
          </div>
        ) : (
          events.map((e) => (
            <div key={e.id} className="rounded-md border border-border/60 bg-surface-2 p-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                {e.kind === "spec-shipped" ? <CheckCircle2 className="h-3 w-3 text-[color:var(--success)]" /> : <Activity className="h-3 w-3 text-[color:var(--info)]" />}
                <Badge variant="outline" className="text-[9px]">{e.kind}</Badge>
                <span className="ml-auto text-[10px] text-muted-foreground">{formatRelativeTime(e.at)}</span>
              </div>
              <div className="mt-0.5 text-pretty">{e.message}</div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CheckCircle2(props: { className?: string }) { return React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", className: props.className }, React.createElement("circle", { cx: "12", cy: "12", r: "10" }), React.createElement("path", { d: "m9 12 2 2 4-4" })); }

function ActivityFeed({ activity }: { activity: Awaited<ReturnType<typeof listRecentActivity>> }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5"><Activity className="h-3 w-3" /> Activity</CardDescription>
        <CardTitle className="mt-1 text-sm">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-2 border-l border-border pl-4">
          {activity.map((it) => {
            const isCommit = it.kind === "commit";
            return (
              <li key={it.kind + "_" + it.id} className="relative">
                <span className={cn("absolute -left-[1.4rem] top-1.5 grid h-3 w-3 place-items-center rounded-full ring-4 ring-background", isCommit ? "bg-[color:var(--graph-commit)]" : "bg-[color:var(--primary)]")} />
                <div className="rounded-md border border-border bg-card p-2.5">
                  <div className="flex items-center gap-2 text-[10px]">
                    {isCommit ? <Badge variant="ghost" className="font-mono">{(it as { hash?: string }).hash}</Badge> : <DevLogKindBadge kind={(it as { subtitle?: string }).subtitle as never} />}
                    <span className="ml-auto text-[10px] text-muted-foreground">{formatRelativeTime(it.ts)}</span>
                  </div>
                  <div className="mt-0.5 text-sm leading-snug">{truncate(it.title, 80)}</div>
                </div>
              </li>
            );
          })}
          {activity.length === 0 && <div className="text-xs text-muted-foreground">No recent activity.</div>}
        </ol>
      </CardContent>
    </Card>
  );
}

function SuggestionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> AI</CardDescription>
        <CardTitle className="mt-1 text-sm">Always-on suggestions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="rounded-md border border-border p-2.5">
          <Badge variant="warning" className="mb-1.5">Pattern</Badge>
          <p className="text-pretty text-foreground/90">Consider extracting the climbable surface manifest into a shared asset if Memory Echoes adds more world-persistent data.</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <Badge variant="info" className="mb-1.5">Suggestion</Badge>
          <p className="text-pretty text-foreground/90">Two specs reference the same SaveSystem contract. Consider drafting an interface note.</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <Badge variant="success" className="mb-1.5">Insight</Badge>
          <p className="text-pretty text-foreground/90">Memory decay is keeping recent patterns sharp. Long-untouched decisions may be candidates for re-validation.</p>
        </div>
      </CardContent>
    </Card>
  );
}
