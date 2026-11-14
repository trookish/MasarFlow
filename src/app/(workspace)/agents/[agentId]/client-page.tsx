"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Activity,
  CheckCircle2,
  AlertCircle,
  Boxes,
  ListTodo,
  ShieldCheck,
  Gauge,
  TestTube,
  BookOpen,
  Palette,
  Cpu,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { EntityNotFound } from "@/components/common/entity-not-found";
import { useAgents, useTasks, useAgentRuns } from "@/lib/db/repos/misc";
import { useActiveProject } from "@/lib/db/repos/projects";
import { AGENT_ROLES, type Task } from "@/lib/db/schema";
import { formatRelativeTime, cn } from "@/lib/utils";
import { toast } from "sonner";
import { runAgentCompletion, type AgentStep } from "@/lib/ai/core";

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
const ROLE_ACCENT = {
  architect: "var(--graph-arch)",
  planner: "var(--primary)",
  programmer: "var(--graph-commit)",
  reviewer: "var(--warning)",
  optimizer: "var(--info)",
  tester: "var(--success)",
  documenter: "var(--graph-doc)",
  designer: "var(--graph-memory)",
};

export default function AgentDetailPage() {
  const params = useParams<{ agentId: string }>();
  const agents = useAgents();
  const project = useActiveProject();
  const tasks = useTasks(project?.id);
  const [liveSteps, setLiveSteps] = React.useState<Array<AgentStep> | null>(null);
  const [running, setRunning] = React.useState(false);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string>("none");

  const agent = (agents ?? []).find((a) => a.id === params.agentId);
  const Icon = agent ? (ROLE_ICON[agent.role as keyof typeof ROLE_ICON] ?? Bot) : Bot;
  const accent = agent
    ? (ROLE_ACCENT[agent.role as keyof typeof ROLE_ACCENT] ?? "var(--primary)")
    : "var(--primary)";

  const runs = useAgentRuns(agent?.id);

  if (agents === undefined || tasks === undefined) return <PageSkeleton />;
  if (!agent)
    return (
      <EntityNotFound
        icon={Bot}
        title="Agent not found"
        description="The agent you're looking for doesn't exist or has been removed."
        backHref="/agents"
        backLabel="Back to agents"
      />
    );

  const runAgent = async () => {
    if (!project) return;
    setRunning(true);
    setLiveSteps([]);
    
    let targetTask: Task | undefined;
    if (selectedTaskId !== "none") {
      targetTask = tasks.find(t => t.id === selectedTaskId);
    }

    try {
      await runAgentCompletion(
        { agent, targetTask, projectId: project.id },
        (step) => {
          setLiveSteps((s) => [...(s ?? []), step]);
        }
      );
      toast.success(agent.name + " finished");
    } catch (err) {
      console.error(err);
      toast.error("Agent encountered an error.");
      setLiveSteps((s) => [...(s ?? []), { kind: "error", text: "Fatal error occurred." }]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="pb-10">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-background/85 px-6 py-2.5 backdrop-blur">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/agents" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to agents
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border-r border-border pr-3">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <select 
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="bg-transparent text-sm outline-none w-48 text-ellipsis disabled:opacity-50"
              disabled={running}
            >
              <option value="none">General Context</option>
              {tasks.filter(t => t.status !== "done").map(t => (
                <option key={t.id} value={t.id}>Task: {t.title}</option>
              ))}
            </select>
          </div>
          <Button className="gap-2" onClick={runAgent} disabled={running}>
            {running ? "Running..." : "Dispatch"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div className="flex items-center gap-3">
            <span
              className="grid h-12 w-12 place-items-center rounded-lg"
              style={{
                backgroundColor: `color-mix(in oklch, ${accent} 18%, transparent)`,
                color: accent,
              }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-balance text-2xl font-semibold tracking-tight">
                {agent.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="capitalize">
                  {agent.role}
                </Badge>
                <span className="capitalize">Status: {agent.status}</span>
                {agent.lastRunAt && (
                  <span>last run {formatRelativeTime(agent.lastRunAt)}</span>
                )}
              </div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardDescription>Persona</CardDescription>
              <CardTitle className="text-sm italic text-pretty">
                &quot;{agent.persona}&quot;
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-pretty text-muted-foreground">
              {agent.description}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Capabilities</CardDescription>
              <CardTitle className="text-sm">
                {agent.capabilities.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {agent.capabilities.map((c, idx) => (
                <Badge key={idx} variant="secondary" className="text-[10px]">
                  {c}
                </Badge>
              ))}
            </CardContent>
          </Card>

          {liveSteps && liveSteps.length > 0 && (
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5">
                  <Activity
                    className={cn(
                      "h-3.5 w-3.5",
                      running && "animate-pulse text-[var(--primary)]"
                    )}
                  />
                  Live reasoning chain
                </CardDescription>
                <CardTitle className="text-sm">
                  {running ? "Running..." : "Completed"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {liveSteps.map((s, idx) => (
                  <ReasoningStep key={idx} kind={s.kind} text={s.text} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardDescription>Recent runs</CardDescription>
              <CardTitle className="text-sm">{runs.length} on record</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                runs.map((r) => (
                  <details
                    key={r.id}
                    className="group rounded-md border border-border bg-card"
                  >
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                      {r.status === "completed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-[var(--danger)]" />
                      )}
                      <span className="font-medium">{r.target}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {formatRelativeTime(r.startedAt)} -{" "}
                        {(r.durationMs / 1000).toFixed(1)}s
                      </span>
                    </summary>
                    <div className="space-y-1.5 border-t border-border bg-surface-2 p-3">
                      {r.steps.map((s, stepIdx) => (
                        <ReasoningStep
                          key={stepIdx}
                          kind={s.kind}
                          text={s.text}
                        />
                      ))}
                    </div>
                  </details>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardDescription>System prompt</CardDescription>
              <CardTitle className="text-sm">Identity</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                You are {agent.name}, a {agent.role} agent in MasarFlow.
                Persona: {agent.persona}. Capabilities:{" "}
                {agent.capabilities.join(", ")}. Always respond in the language
                of the project and respect the user standards.
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Other roles</CardDescription>
              <CardTitle className="text-sm">
                {AGENT_ROLES.length - 1}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {AGENT_ROLES.filter((r) => r !== agent.role).map((r, i) => {
                const other = (agents ?? []).find((a) => a.role === r);
                if (!other) return null;
                return (
                  <Link
                    key={i}
                    href={`/agents/${other.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/40"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          ROLE_ACCENT[r as keyof typeof ROLE_ACCENT] ??
                          "var(--primary)",
                      }}
                    />
                    <span className="font-medium">{other.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {r}
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ReasoningStep({ kind, text }: { kind: string; text: string }) {
  const tints: Record<string, string> = {
    think: "var(--primary)",
    tool: "var(--info)",
    read: "var(--warning)",
    write: "var(--graph-memory)",
    done: "var(--success)",
    error: "var(--danger)",
  };
  const tint = tints[kind] ?? "var(--muted-foreground)";

  return (
    <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background p-2 text-[11px]">
      <span
        className="mt-0.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase"
        style={{
          backgroundColor: `color-mix(in oklch, ${tint} 15%, transparent)`,
          color: tint,
        }}
      >
        {kind}
      </span>
      <span className="text-pretty leading-relaxed">{text}</span>
    </div>
  );
}
