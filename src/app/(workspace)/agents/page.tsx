"use client";
import * as React from "react";
import { Bot, Sparkles, Activity, Brain, Boxes, FileText, ListTodo, ShieldCheck, Gauge, TestTube, BookOpen, Palette, Cpu } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAgents } from "@/lib/db/repos/misc";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

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

export default function AgentsPage() {
  const agents = useAgents();

  return (
    <div className="pb-10">
      <PageHeader
        icon={Bot}
        eyebrow="AI Agents"
        title="Specialized collaborators"
        description="Eight distinct agents, each with a persona and capabilities. They collaborate on the same feature, with reasoning shown independently."
      />

      <div className="px-6 py-5">
        <Card className="mb-4">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-accent">
              <Sparkles className="h-4 w-4 text-[color:var(--primary)]" />
            </span>
            <div className="flex-1 text-sm">
              <div className="font-medium">Multi-agent reasoning</div>
              <p className="text-muted-foreground text-pretty">
                When you trigger a workflow, each agent contributes independently. You see the reasoning chain
                before approving any action.
              </p>
            </div>
            <Badge variant="success">8 active</Badge>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {agents?.map((a) => {
            const Icon = ROLE_ICON[a.role as keyof typeof ROLE_ICON];
            const accent = ROLE_ACCENT[a.role as keyof typeof ROLE_ACCENT];
            return (
              <Card key={a.id} className="group transition-all hover:border-border/80">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-md"
                      style={{
                        backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)`,
                        color: accent,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-sm">{a.name}</CardTitle>
                      <CardDescription className="text-[10px] uppercase tracking-wider">
                        {a.role}
                      </CardDescription>
                    </div>
                    <StatusDot status={a.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0 text-xs">
                  <p className="line-clamp-2 text-pretty text-muted-foreground">{a.description}</p>
                  <p className="line-clamp-2 text-pretty italic">&ldquo;{a.persona}&rdquo;</p>
                  <div className="flex flex-wrap gap-1">
                    {a.capabilities.slice(0, 3).map((c) => (
                      <Badge key={c} variant="ghost" className="text-[9px]">
                        {c}
                      </Badge>
                    ))}
                  </div>
                  <div className="border-t border-border pt-2 text-[10px] text-muted-foreground">
                    {a.lastRunAt ? `Last run ${formatRelativeTime(a.lastRunAt)}` : "Never run"}
                  </div>
                </CardContent>
              </Card>
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
