"use client";
import * as React from "react";
import Link from "next/link";
import { Bot, Sparkles, Activity, Brain, Boxes, FileText, ListTodo, ShieldCheck, Gauge, TestTube, BookOpen, Palette, Cpu, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAgents } from "@/lib/db/repos/misc";
import { formatRelativeTime, cn } from "@/lib/utils";

const ROLE_ICON = {
  architect: Boxes,
  planner: ListTodo,
  programmer: Cpu,
  reviewer: ShieldCheck,
  optimizer: Gauge,
  tester: TestTube,
  documenter: BookOpen,
  designer: Palette,
} as const;

const ROLE_ACCENT: Record<keyof typeof ROLE_ICON, string> = {
  architect: "var(--graph-arch)",
  planner: "var(--primary)",
  programmer: "var(--graph-commit)",
  reviewer: "var(--warning)",
  optimizer: "var(--info)",
  tester: "var(--success)",
  documenter: "var(--graph-doc)",
  designer: "var(--graph-memory)",
};

const ROLE_DESCRIPTION: Record<keyof typeof ROLE_ICON, string> = {
  architect: "Owns the big picture. Surfaces affected systems, contracts, and lifetime concerns before any code is written.",
  planner: "Turns approved specs into sequenced, testable steps. Calls out risks, estimates, and a roadmap.",
  programmer: "Reads context, follows your standards, writes code as if you wrote it. Implements task by task.",
  reviewer: "Catches what the others miss. Reviews diffs, surfaces standards violations, and design smells.",
  optimizer: "Measures twice, cuts once. Profiles, allocates, and refactors for performance.",
  tester: "Adversarial by default. Writes and runs tests against the spec’s acceptance criteria.",
  documenter: "Says what the code does in the language of the reader. Auto-maintains system, API, and architecture docs.",
  designer: "Wears the player’s shoes. Advocates for feel, clarity, and onboarding.",
};

export default function AgentsPage() {
  const agents = useAgents();
  const active = (agents ?? []).filter((a) => a.status !== "idle").length;

  return (
    <div className="pb-10">
      <PageHeader
        icon={Bot}
        eyebrow="AI Agents"
        title="Specialized collaborators"
        description="Eight distinct agents, each with a persona and capabilities. They collaborate on the same feature; reasoning is shown independently."
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Badge variant="success" className="gap-1.5"><Activity className="h-3 w-3 animate-pulse" />{active} active</Badge>
            <Badge variant="ghost">{(agents ?? []).length} total</Badge>
          </div>
        }
      />

      <div className="px-6 py-5 space-y-5">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent">
              <Sparkles className="h-4 w-4 text-[color:var(--primary)]" />
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium">Multi-agent reasoning</div>
              <p className="text-muted-foreground text-pretty">When a workflow runs, each agent contributes independently. You see the reasoning chain before approving any action.</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(agents ?? []).map((a) => {
            const Icon = ROLE_ICON[a.role as keyof typeof ROLE_ICON] ?? Brain;
            const accent = ROLE_ACCENT[a.role as keyof typeof ROLE_ACCENT] ?? "var(--primary)";
            const description = ROLE_DESCRIPTION[a.role as keyof typeof ROLE_DESCRIPTION] ?? a.description;
            return (
              <Link
                key={a.id}
                href={`/agents/${a.id}`}
                className="group block rounded-lg border border-border bg-card p-4 transition-all hover:border-border/80 hover:bg-accent/20"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="grid h-8 w-8 place-items-center rounded-md" style={{ backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)`, color: accent }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <h3 className="text-sm font-semibold leading-snug">{a.name}</h3>
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground text-pretty">{description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {a.capabilities.slice(0, 3).map((c) => (
                    <Badge key={c} variant="ghost" className="text-[9px]">{c}</Badge>
                  ))}
                </div>
                <div className={cn("mt-3 flex items-center gap-1.5 text-[10px]")}>
                  <StatusDot status={a.status} />
                  <span className="text-muted-foreground">{a.lastRunAt ? `last run ${formatRelativeTime(a.lastRunAt)}` : "never run"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "thinking" && "bg-[color:var(--primary)] animate-pulse-soft",
          status === "acting" && "bg-[color:var(--info)]",
          status === "waiting" && "bg-[color:var(--warning)]",
          status === "error" && "bg-[color:var(--danger)]",
          status === "idle" && "bg-muted-foreground/40",
        )}
      />
    </span>
  );
}
