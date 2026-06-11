"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot, Activity, Sparkles, Brain, FileText, Terminal, CheckCircle2, AlertCircle, Play, Boxes, ListTodo, ShieldCheck, Gauge, TestTube, BookOpen, Palette, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgents } from "@/lib/db/repos/misc";
import { getDb, type Agent, AGENT_ROLES } from "@/lib/db/schema";
import { formatRelativeTime, cn } from "@/lib/utils";
import { toast } from "sonner";

const ROLE_ICON = { architect: Boxes, planner: ListTodo, programmer: Cpu, reviewer: ShieldCheck, optimizer: Gauge, tester: TestTube, documenter: BookOpen, designer: Palette } as const;
const ROLE_ACCENT = { architect: "var(--graph-arch)", planner: "var(--primary)", programmer: "var(--graph-commit)", reviewer: "var(--warning)", optimizer: "var(--info)", tester: "var(--success)", documenter: "var(--graph-doc)", designer: "var(--graph-memory)" };

export default function AgentDetailPage() {
  const params = useParams<{ agentId: string }>();
  const agents = useAgents();
  const [liveSteps, setLiveSteps] = React.useState<Array<{ kind: string; text: string }> | null>(null);
  const [running, setRunning] = React.useState(false);
  const agent = (agents ?? []).find((a) => a.id === params.agentId);
  const Icon = agent ? (ROLE_ICON[agent.role as keyof typeof ROLE_ICON] ?? Bot) : Bot;
  const accent = agent ? (ROLE_ACCENT[agent.role as keyof typeof ROLE_ACCENT] ?? "var(--primary)") : "var(--primary)";
  if (agents === undefined) return React.createElement(Skeleton, { className: "m-6 h-96" });
  if (!agent) return React.createElement("div", { className: "p-6" }, React.createElement(Button, { variant: "ghost", size: "sm", asChild: true }, React.createElement(Link, { href: "/agents", className: "gap-1.5" }, React.createElement(ArrowLeft, { className: "h-3.5 w-3.5" }), "Back to agents")));
  const runAgent = async () => {
    setRunning(true);
    setLiveSteps([]);
    const lines = [{ kind: "think", text: "Hi, I am " + agent.name + ". Reading context." }, { kind: "read", text: "Pulling notes, standards, architecture, and current spec." }, { kind: "think", text: "Cross-referencing dependencies. No conflicts detected." }, { kind: "write", text: "Contributing per persona." }, { kind: "done", text: "Handed off to the next agent in the pipeline." }];
    for (const step of lines) {
      await new Promise((r) => setTimeout(r, 450));
      setLiveSteps((s) => [...(s ?? []), step]);
    }
    setRunning(false);
    await getDb().agents.update(agent.id, { lastRunAt: Date.now(), status: "idle" });
    toast.success(agent.name + " finished");
  };
  const runs = [
    { id: "r1", target: agent.name + " - recent task", status: "completed", durationMs: 12000, startedAt: Date.now() - 3600000, steps: [{ kind: "think", text: "Analyzing the request..." }, { kind: "read", text: "Read 3 notes and 2 specs." }, { kind: "write", text: "Proposed approach..." }, { kind: "done", text: "Complete." }] },
    { id: "r2", target: "Earlier session", status: "completed", durationMs: 9000, startedAt: Date.now() - 86400000, steps: [{ kind: "think", text: "Considering alternatives..." }, { kind: "done", text: "Handed off." }] },
  ];
  return React.createElement("div", { className: "pb-10" },
    React.createElement("div", { className: "sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-background/85 px-6 py-2.5 backdrop-blur" },
      React.createElement(Button, { variant: "ghost", size: "sm", asChild: true }, React.createElement(Link, { href: "/agents", className: "gap-1.5" }, React.createElement(ArrowLeft, { className: "h-3.5 w-3.5" }), "Back to agents")),
      React.createElement(Button, { className: "gap-2", onClick: runAgent, disabled: running }, running ? "Running..." : "Run once"),
    ),
    React.createElement("div", { className: "grid gap-4 px-6 py-5 lg:grid-cols-12" },
      React.createElement("div", { className: "space-y-4 lg:col-span-8" },
        React.createElement("div", { className: "flex items-center gap-3" },
          React.createElement("span", { className: "grid h-12 w-12 place-items-center rounded-lg", style: { backgroundColor: "color-mix(in oklch, " + accent + " 18%, transparent)", color: accent } }, React.createElement(Icon, { className: "h-5 w-5" })),
          React.createElement("div", { className: "min-w-0 flex-1" },
            React.createElement("h1", { className: "text-balance text-2xl font-semibold tracking-tight" }, agent.name),
            React.createElement("div", { className: "flex flex-wrap items-center gap-2 text-xs text-muted-foreground" },
              React.createElement(Badge, { variant: "outline", className: "capitalize" }, agent.role),
              React.createElement("span", { className: "capitalize" }, agent.status),
              agent.lastRunAt ? React.createElement("span", null, "last run " + formatRelativeTime(agent.lastRunAt)) : null,
            ),
          ),
        ),
        React.createElement(Card, null,
          React.createElement(CardHeader, null,
            React.createElement(CardDescription, null, "Persona"),
            React.createElement(CardTitle, { className: "text-sm italic text-pretty" }, String.fromCharCode(34) + agent.persona + String.fromCharCode(34)),
          ),
          React.createElement(CardContent, { className: "text-sm text-pretty text-muted-foreground" }, agent.description),
        ),
        React.createElement(Card, null,
          React.createElement(CardHeader, null,
            React.createElement(CardDescription, null, "Capabilities"),
            React.createElement(CardTitle, { className: "text-sm" }, String(agent.capabilities.length)),
          ),
          React.createElement(CardContent, { className: "flex flex-wrap gap-1.5" }, agent.capabilities.map((c, i) => React.createElement(Badge, { key: i, variant: "secondary", className: "text-[10px]" }, c))),
        ),
        liveSteps && liveSteps.length > 0 ? React.createElement(Card, null,
          React.createElement(CardHeader, null,
            React.createElement(CardDescription, { className: "flex items-center gap-1.5" }, React.createElement(Activity, { className: cn("h-3.5 w-3.5", running && "animate-pulse text-[var(--primary)]") }), "Live reasoning chain"),
            React.createElement(CardTitle, { className: "text-sm" }, running ? "Running..." : "Completed"),
          ),
          React.createElement(CardContent, { className: "space-y-1.5" }, liveSteps.map((s, i) => React.createElement(ReasoningStep, { key: i, kind: s.kind, text: s.text }))),
        ) : null,
        React.createElement(Card, null,
          React.createElement(CardHeader, null,
            React.createElement(CardDescription, null, "Recent runs"),
            React.createElement(CardTitle, { className: "text-sm" }, runs.length + " on record"),
          ),
          React.createElement(CardContent, { className: "space-y-2" }, runs.length === 0 ? React.createElement("p", { className: "text-sm text-muted-foreground" }, "No runs yet.") : runs.map((r, i) => React.createElement("details", { key: r.id, className: "group rounded-md border border-border bg-card" },
            React.createElement("summary", { className: "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm" },
              r.status === "completed" ? React.createElement(CheckCircle2, { className: "h-3.5 w-3.5 text-[var(--success)]" }) : React.createElement(AlertCircle, { className: "h-3.5 w-3.5 text-[var(--danger)]" }),
              React.createElement("span", { className: "font-medium" }, r.target),
              React.createElement("span", { className: "ml-auto text-[10px] text-muted-foreground" }, formatRelativeTime(r.startedAt) + " - " + (r.durationMs / 1000).toFixed(1) + "s"),
            ),
            React.createElement("div", { className: "space-y-1.5 border-t border-border bg-surface-2 p-3" }, r.steps.map((s, j) => React.createElement(ReasoningStep, { key: j, kind: s.kind, text: s.text }))),
          ))),
        ),
      ),
      React.createElement("aside", { className: "space-y-4 lg:col-span-4" },
        React.createElement(Card, null,
          React.createElement(CardHeader, null,
            React.createElement(CardDescription, null, "System prompt"),
            React.createElement(CardTitle, { className: "text-sm" }, "Identity"),
          ),
          React.createElement(CardContent, null, React.createElement("pre", { className: "whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground" }, "You are " + agent.name + ", a " + agent.role + " agent in MasarFlow. Persona: " + agent.persona + ". Capabilities: " + agent.capabilities.join(", ") + ". Always respond in the language of the project and respect the user standards.")),
        ),
        React.createElement(Card, null,
          React.createElement(CardHeader, null,
            React.createElement(CardDescription, null, "Other roles"),
            React.createElement(CardTitle, { className: "text-sm" }, String(AGENT_ROLES.length - 1)),
          ),
          React.createElement(CardContent, { className: "space-y-1" }, AGENT_ROLES.filter((r) => r !== agent.role).map((r, i) => { const other = (agents ?? []).find((a) => a.role === r); if (!other) return null; return React.createElement(Link, { key: i, href: "/agents/" + other.id, className: "flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/40" }, React.createElement("span", { className: "h-1.5 w-1.5 rounded-full", style: { backgroundColor: ROLE_ACCENT[r as keyof typeof ROLE_ACCENT] ?? "var(--primary)" } }), React.createElement("span", { className: "font-medium" }, other.name), React.createElement("span", { className: "ml-auto text-[10px] text-muted-foreground" }, r)); })),
        ),
      ),
    ),
  );
}

function ReasoningStep({ kind, text }: { kind: string; text: string }) {
  const tints: Record<string, string> = { think: "var(--primary)", tool: "var(--info)", read: "var(--warning)", write: "var(--graph-memory)", done: "var(--success)" };
  const tint = tints[kind] ?? "var(--muted-foreground)";
  return React.createElement("div", { className: "flex items-start gap-2 rounded-md border border-border/60 bg-background p-2 text-[11px]" },
    React.createElement("span", { className: "mt-0.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase", style: { backgroundColor: "color-mix(in oklch, " + tint + " 15%, transparent)", color: tint } }, kind),
    React.createElement("span", { className: "text-pretty leading-relaxed" }, text),
  );
}
