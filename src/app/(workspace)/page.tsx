"use client";
import * as React from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Sparkles,
  Activity,
  GitCommit,
  Calendar,
  Bot,
  ListTodo,
  FileText,
  Brain,
  Boxes,
  ArrowUpRight,
  ShieldCheck,
  ScrollText,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricRing, TrendBadge } from "@/components/common/metrics";
import { SpecStatusBadge, TaskStatusBadge, TaskPriorityBadge, DevLogKindBadge } from "@/components/common/badges";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSpecs, useAllPlans } from "@/lib/db/repos/specs";
import { useTasks, useDevLogs, useCommits, useAgents, useMemories, useSystems } from "@/lib/db/repos/misc";
import { useNotes } from "@/lib/db/repos/notes";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime, pluralize } from "@/lib/utils";

function MiniGraph() {
  const project = useActiveProject();
  const notes = useNotes(project?.id);
  const specs = useSpecs(project?.id);
  const tasks = useTasks(project?.id);
  const systems = useSystems(project?.id);

  const nodes = React.useMemo(() => {
    const n: Array<{ id: string; cx: number; cy: number; r: number; color: string; label: string }> = [];
    const W = 320;
    const H = 160;
    const cx = W / 2;
    const cy = H / 2;
    const R = 56;

    const makeRing = (count: number, offset: number, kind: string, color: string) => {
      for (let i = 0; i < Math.min(count, 4); i++) {
        const a = (i / Math.max(1, count - 1)) * Math.PI * 2 + offset;
        n.push({
          id: `${kind}_${i}`,
          cx: cx + Math.cos(a) * R,
          cy: cy + Math.sin(a) * R,
          r: 6,
          color,
          label: kind,
        });
      }
    };

    makeRing(notes?.length ?? 0, 0, "note", "var(--graph-note)");
    makeRing(specs?.length ?? 0, Math.PI / 4, "spec", "var(--graph-spec)");
    makeRing(tasks?.length ?? 0, Math.PI / 2, "task", "var(--graph-task)");
    makeRing(systems?.length ?? 0, Math.PI, "system", "var(--graph-system)");
    return n;
  }, [notes?.length, specs?.length, tasks?.length, systems?.length]);

  return (
    <svg viewBox="0 0 320 160" className="h-40 w-full">
      <defs>
        <radialGradient id="g-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="80" r="50" fill="url(#g-glow)" />
      {nodes.map((a, i) =>
        nodes.slice(i + 1).map((b, j) => (
          <line
            key={`${a.id}_${b.id}`}
            x1={a.cx}
            y1={a.cy}
            x2={b.cx}
            y2={b.cy}
            stroke="var(--border)"
            strokeOpacity="0.4"
            strokeWidth="0.5"
          />
        )),
      )}
      {nodes.map((n) => (
        <g key={n.id}>
          <circle cx={n.cx} cy={n.cy} r={n.r} fill={n.color} />
          <circle cx={n.cx} cy={n.cy} r={n.r + 4} fill="none" stroke={n.color} strokeOpacity="0.2" />
        </g>
      ))}
      <circle cx="160" cy="80" r="14" fill="var(--background)" stroke="var(--primary)" strokeWidth="1.5" />
      <text x="160" y="84" textAnchor="middle" fontSize="9" fill="var(--primary)" fontWeight="600">
        AURORA
      </text>
    </svg>
  );
}

function HealthCard() {
  const project = useActiveProject();
  if (!project) return <Skeleton className="h-32" />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardDescription>Project Health</CardDescription>
          <CardTitle className="mt-1 text-lg">Aurora Rising</CardTitle>
        </div>
        <MetricRing value={project.health} size={48} stroke={4} />
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 pt-0 text-xs">
        <div>
          <div className="text-muted-foreground">Architecture</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums">{project.archScore}</span>
            <TrendBadge delta={4} />
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Tech Debt</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums">{project.techDebt}</span>
            <TrendBadge delta={-3} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsRow() {
  const project = useActiveProject();
  const specs = useSpecs(project?.id);
  const tasks = useTasks(project?.id);
  const memories = useMemories(project?.id);

  const stats = [
    {
      label: "Active Specs",
      value: specs?.filter((s) => s.status === "implementing" || s.status === "review").length ?? 0,
      icon: FileText,
      color: "var(--graph-spec)",
      href: "/specs",
    },
    {
      label: "Open Tasks",
      value: tasks?.filter((t) => t.status !== "done").length ?? 0,
      icon: ListTodo,
      color: "var(--graph-task)",
      href: "/tasks",
    },
    {
      label: "Memories",
      value: memories?.length ?? 0,
      icon: Brain,
      color: "var(--graph-memory)",
      href: "/brain",
    },
    {
      label: "AI Agents",
      value: 8,
      icon: Bot,
      color: "var(--graph-memory)",
      href: "/agents",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Link
            key={s.label}
            href={s.href}
            className="group relative flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-border/80 hover:bg-accent/30"
          >
            <span
              className="grid h-8 w-8 place-items-center rounded-md"
              style={{ backgroundColor: `color-mix(in oklch, ${s.color} 18%, transparent)`, color: s.color }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold tabular-nums">{s.value}</div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        );
      })}
    </div>
  );
}

function SpecsList() {
  const project = useActiveProject();
  const specs = useSpecs(project?.id);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardDescription>Active specifications</CardDescription>
          <CardTitle className="mt-1">In Flight</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/specs">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {specs?.slice(0, 4).map((s) => (
          <Link
            key={s.id}
            href={`/specs/${s.id}`}
            className="block rounded-md border border-border p-3 transition-colors hover:border-border/80 hover:bg-accent/30"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">{s.number}</span>
              <SpecStatusBadge status={s.status} />
              <span className="ml-auto text-[10px] text-muted-foreground">
                {formatRelativeTime(s.updatedAt)}
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-medium">{s.title}</div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${s.implementationProgress}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {s.implementationProgress}%
              </span>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function TasksList() {
  const project = useActiveProject();
  const tasks = useTasks(project?.id);
  const top = tasks?.slice(0, 5) ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardDescription>Open work</CardDescription>
          <CardTitle className="mt-1">Tasks</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tasks">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {top.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm"
          >
            <TaskStatusBadge status={t.status} />
            <span className="flex-1 truncate">{t.title}</span>
            <TaskPriorityBadge priority={t.priority} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentActivity() {
  const project = useActiveProject();
  const logs = useDevLogs(project?.id);
  const commits = useCommits(project?.id);
  const items = [
    ...(logs?.slice(0, 3).map((l) => ({
      kind: "devlog" as const,
      id: l.id,
      title: l.title,
      meta: l.kind,
      ts: l.createdAt,
    })) ?? []),
    ...(commits?.slice(0, 3).map((c) => ({
      kind: "commit" as const,
      id: c.id,
      title: c.message,
      meta: c.hash,
      ts: c.date,
    })) ?? []),
  ]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardDescription>Timeline</CardDescription>
        <CardTitle className="mt-1">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-3 border-l border-border pl-4">
          {items.map((it) => (
            <li key={`${it.kind}_${it.id}`} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 grid h-2.5 w-2.5 place-items-center rounded-full bg-background ring-2 ring-primary" />
              <div className="flex items-center gap-2 text-xs">
                {it.kind === "devlog" ? (
                  <DevLogKindBadge kind={it.meta as never} />
                ) : (
                  <Badge variant="ghost" className="font-mono text-[10px]">
                    <GitCommit className="h-3 w-3" /> {it.meta}
                  </Badge>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {formatRelativeTime(it.ts)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-pretty">{it.title}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function GraphCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardDescription>Preview</CardDescription>
          <CardTitle className="mt-1">Knowledge Graph</CardTitle>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/knowledge-graph">Open</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <MiniGraph />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          {[
            ["Note", "var(--graph-note)"],
            ["Spec", "var(--graph-spec)"],
            ["Task", "var(--graph-task)"],
            ["System", "var(--graph-system)"],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineCard() {
  const project = useActiveProject();
  const plans = useAllPlans();
  const projectPlans = plans?.filter((p) => {
    if (!project) return false;
    return p.specId.startsWith("spec_");
  }) ?? [];
  const pending = projectPlans.filter((p) => p.status === "awaiting_approval").length;
  const approved = projectPlans.filter((p) => p.status === "approved").length;
  const steps = [
    { label: "Ideas", count: 12, color: "var(--graph-idea)" },
    { label: "Knowledge", count: 12, color: "var(--graph-note)" },
    { label: "Specs", count: 3, color: "var(--graph-spec)" },
    { label: "Plans", count: projectPlans.length, color: "var(--graph-memory)" },
    { label: "Tasks", count: 8, color: "var(--graph-task)" },
    { label: "Code", count: 247, color: "var(--graph-commit)" },
    { label: "Docs", count: 3, color: "var(--graph-doc)" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardDescription>Flow</CardDescription>
        <CardTitle className="mt-1">Implementation pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((s, i) => (
            <React.Fragment key={s.label}>
              <div
                className="flex min-w-[60px] flex-col items-center rounded-md border border-border p-2"
                style={{ borderColor: `color-mix(in oklch, ${s.color} 25%, var(--border))` }}
              >
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: s.color }}>
                  {s.count}
                </span>
              </div>
              {i < steps.length - 1 && (
                <ArrowUpRight className="h-3 w-3 text-muted-foreground/50" />
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-[color:var(--primary)]" />
          <span>
            {pending} plan{pending === 1 ? "" : "s"} awaiting approval · {approved} approved
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function MilestonesCard() {
  const items = [
    { label: "Vertical slice playable", date: "in 3 weeks", progress: 64 },
    { label: "Alpha build", date: "in 6 weeks", progress: 41 },
    { label: "Closed beta", date: "in 11 weeks", progress: 18 },
  ];
  return (
    <Card>
      <CardHeader>
        <CardDescription>Roadmap</CardDescription>
        <CardTitle className="mt-1">Upcoming milestones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((m) => (
          <div key={m.label} className="rounded-md border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{m.label}</div>
              <Badge variant="ghost" className="gap-1 font-normal">
                <Calendar className="h-3 w-3" /> {m.date}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${m.progress}%` }} />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{m.progress}%</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <div className="pb-10">
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="Dashboard"
        title="Welcome back, Tariq"
        description="A live view of your project's intelligence layer. Every signal below is derived from your notes, specs, tasks, and agents."
        actions={
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> New feature
          </Button>
        }
      />

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <StatsRow />
          <div className="grid gap-4 sm:grid-cols-2">
            <HealthCard />
            <GraphCard />
          </div>
          <PipelineCard />
          <div className="grid gap-4 sm:grid-cols-2">
            <SpecsList />
            <TasksList />
          </div>
        </div>
        <div className="space-y-4 lg:col-span-4">
          <RecentActivity />
          <MilestonesCard />
          <Card>
            <CardHeader>
              <CardDescription>Always-on</CardDescription>
              <CardTitle className="mt-1">AI Suggestions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="rounded-md border border-border p-2.5">
                <Badge variant="warning" className="mb-1.5">
                  Pattern
                </Badge>
                <p className="text-pretty">
                  Consider extracting the climbable surface manifest into a shared asset if Memory Echoes adds
                  more world-persistent data.
                </p>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <Badge variant="info" className="mb-1.5">
                  Suggestion
                </Badge>
                <p className="text-pretty">
                  Two specs reference the same SaveSystem contract. Consider drafting an interface note.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
