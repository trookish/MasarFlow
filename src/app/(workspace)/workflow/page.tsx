"use client";
import * as React from "react";
import Link from "next/link";
import { Workflow, Check, Circle, Sparkles, ArrowRight, Wand2, FileText, ListTodo, BookOpen, Brain, ShieldCheck, GitBranch, Activity, Zap } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSpecs, useAllPlans } from "@/lib/db/repos/specs";
import { useTasks, useAgents } from "@/lib/db/repos/misc";
import { type Agent } from "@/lib/db/schema";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Step { id: string; label: string; description: string; icon: React.ComponentType<{ className?: string }>; agent?: Agent["role"]; }

const STEPS: Step[] = [
  { id: "s1", label: "Understand intent", description: "Parse the request; identify the feature, goal, and constraints.", icon: Brain },
  { id: "s2", label: "Retrieve context", description: "Pull relevant notes, standards, architecture, and dependencies.", icon: Sparkles, agent: "architect" },
  { id: "s3", label: "Retrieve specs", description: "Match against existing RFCs and related feature specs.", icon: FileText, agent: "architect" },
  { id: "s4", label: "Retrieve standards", description: "Load enforced personal standards and coding rules.", icon: ShieldCheck, agent: "reviewer" },
  { id: "s5", label: "Retrieve architecture", description: "Traverse dependency graph and existing system contracts.", icon: GitBranch, agent: "architect" },
  { id: "s6", label: "Retrieve dependencies", description: "Resolve standards, notes, and modules this spec depends on.", icon: Activity, agent: "architect" },
  { id: "s7", label: "Retrieve project memory", description: "Surface past decisions, lessons, and patterns.", icon: Brain, agent: "architect" },
  { id: "s8", label: "Analyze impact", description: "Cross-check: what breaks? what improves? what risks arise?", icon: Zap, agent: "reviewer" },
  { id: "s9", label: "Generate plan", description: "Compose summary, affected systems, complexity, roadmap.", icon: Wand2, agent: "planner" },
  { id: "s10", label: "Suggest improvements", description: "Offer alternatives; flag risk; propose optimizations.", icon: Sparkles, agent: "optimizer" },
  { id: "s11", label: "Await approval", description: "Hand the plan to the human. Block until they say go.", icon: Check },
  { id: "s12", label: "Implement", description: "Execute the roadmap task by task, respecting standards.", icon: ListTodo, agent: "programmer" },
  { id: "s13", label: "Generate documentation", description: "Auto-update system, API, and architecture docs.", icon: BookOpen, agent: "documenter" },
  { id: "s14", label: "Update knowledge", description: "New notes, links, tags. Refresh the knowledge graph.", icon: Brain, agent: "documenter" },
  { id: "s15", label: "Update memory", description: "Persist decisions, patterns, and lessons for future runs.", icon: Sparkles, agent: "documenter" },
  { id: "s16", label: "Update tasks & architecture", description: "Refresh dependency graph, task state, and architecture impact.", icon: GitBranch },
];

export default function WorkflowPage() {
  const project = useActiveProject();
  const specs = useSpecs(project?.id);
  const plans = useAllPlans();
  const tasks = useTasks(project?.id);
  const agents = useAgents();
  const [selectedSpecId, setSelectedSpecId] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [completedSteps, setCompletedSteps] = React.useState<Set<string>>(new Set());

  const candidateSpec = selectedSpecId ? specs?.find((s) => s.id === selectedSpecId) : undefined;
  const planForSpec = candidateSpec ? plans?.find((p) => p.specId === candidateSpec.id) : undefined;
  const tasksForSpec = candidateSpec ? tasks?.filter((t) => t.specId === candidateSpec.id) : [];

  React.useEffect(() => {
    if (!selectedSpecId && specs && specs.length > 0) {
      const inFlight = specs.find((s) => s.status === "implementing" || s.status === "review");
      setSelectedSpecId(inFlight?.id ?? specs[0].id);
    }
  }, [specs, selectedSpecId]);

  const startSimulation = async () => {
    if (!candidateSpec) { toast.error("Select a spec first"); return; }
    setRunning(true);
    setCurrentStep(0);
    setCompletedSteps(new Set());
    for (let i = 0; i < STEPS.length; i++) {
      await new Promise((r) => setTimeout(r, 350));
      setCurrentStep(i + 1);
      setCompletedSteps((p) => new Set([...p, STEPS[i].id]));
    }
    setRunning(false);
    toast.success("Workflow complete", { description: "All 16 steps simulated." });
  };

  const stepsByAgent = React.useMemo(() => {
    const m: Record<string, Step[]> = { _global: [] };
    STEPS.forEach((s) => { const k = s.agent ?? "_global"; m[k] ??= []; m[k].push(s); });
    return m;
  }, []);

  return (
    <div className="pb-10">
      <PageHeader
        icon={Workflow}
        eyebrow="AI Workflow"
        title="From idea to implementation - with memory"
        description="The 16-step pipeline every feature traverses in MasarFlow. AI plans first, you approve, AI implements and documents, knowledge updates automatically."
        actions={
          <Button className="gap-2" onClick={startSimulation} disabled={running || !candidateSpec}>
            {running ? <Activity className="h-4 w-4 animate-pulse" /> : <Wand2 className="h-4 w-4" />}
            {running ? "Running…" : "Simulate workflow"}
          </Button>
        }
      />

      <div className="space-y-5 px-6 py-5">
        <Card>
          <CardHeader>
            <CardDescription>Target</CardDescription>
            <CardTitle className="text-sm">Pick a spec to run the workflow against</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Spec:</span>
              {(specs ?? []).map((s) => (
                <button key={s.id} onClick={() => setSelectedSpecId(s.id)} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", selectedSpecId === s.id ? "border-foreground/30 bg-accent" : "border-border text-muted-foreground hover:border-foreground/20")}>
                  <span className="font-mono opacity-70">{s.number}</span> <span>{s.title}</span>
                </button>
              ))}
            </div>
            {candidateSpec && (
              <div className="rounded-md border border-border bg-surface-2 p-3 text-xs">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div><div className="text-muted-foreground">Status</div><div className="font-medium capitalize">{candidateSpec.status}</div></div>
                  <div><div className="text-muted-foreground">Plan</div><div className="font-medium capitalize">{planForSpec?.status?.replace("_", " ") ?? "none"}</div></div>
                  <div><div className="text-muted-foreground">Tasks</div><div className="font-medium">{tasksForSpec?.length ?? 0}</div></div>
                  <div><div className="text-muted-foreground">Progress</div><div className="font-medium">{candidateSpec.implementationProgress}%</div></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Pipeline</CardDescription>
            <CardTitle className="text-sm">The 16 steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-1.5">
              {STEPS.map((s, i) => {
                const done = completedSteps.has(s.id);
                const active = running && currentStep === i;
                const Icon = s.icon;
                const agent = s.agent ? agents?.find((a) => a.role === s.agent) : undefined;
                return (
                  <li key={s.id} className={cn("group relative flex items-center gap-3 rounded-md border p-2.5 text-sm transition-all", done ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/5" : active ? "border-primary bg-primary/5" : "border-border")}>
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", done ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/15 text-[color:var(--success)]" : active ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground")}>
                      {done ? <Check className="h-3.5 w-3.5" /> : active ? <Activity className="h-3.5 w-3.5 animate-pulse" /> : <Icon className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">{i + 1}/16</span>
                        <span className="font-medium">{s.label}</span>
                        {agent && (
                          <Badge variant="outline" className="gap-1 text-[9px]">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `oklch(0.6 0.2 ${i * 20})` }} />
                            {agent.name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground text-pretty">{s.description}</p>
                    </div>
                    {i < STEPS.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/60" />
                    )}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Roles</CardDescription>
            <CardTitle className="text-sm">Who runs what</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(stepsByAgent).filter(([k]) => k !== "_global").map(([role, steps]) => {
                const agent = agents?.find((a) => a.role === role);
                return (
                  <div key={role} className="rounded-md border border-border bg-surface-2 p-3 text-xs">
                    <div className="mb-1 flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-[color:var(--primary)]" />
                      <span className="font-semibold capitalize">{role}</span>
                      {agent && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{steps.length} steps</span>}
                    </div>
                    {agent && <p className="mb-1.5 text-pretty text-muted-foreground">{agent.persona}</p>}
                    <ul className="space-y-0.5 text-muted-foreground">
                      {steps.map((s) => (<li key={s.id}>· {s.label}</li>))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
