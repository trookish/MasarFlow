"use client";
import * as React from "react";
import Link from "next/link";
import { FileText, Plus, Sparkles, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpecStatusBadge, TaskStatusBadge } from "@/components/common/badges";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSpecs, usePlanForSpec, useTasksForSpec } from "@/lib/db/repos/specs";
import { formatRelativeTime, pluralize } from "@/lib/utils";

const FILTER_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "review", label: "In Review" },
  { id: "shipped", label: "Shipped" },
] as const;

export default function SpecsPage() {
  const project = useActiveProject();
  const specs = useSpecs(project?.id);
  const [filter, setFilter] = React.useState<(typeof FILTER_TABS)[number]["id"]>("all");

  const filtered = React.useMemo(() => {
    return (specs ?? []).filter((s) => {
      if (filter === "all") return true;
      if (filter === "active") return s.status === "implementing" || s.status === "approved";
      if (filter === "review") return s.status === "review";
      if (filter === "shipped") return s.status === "shipped";
      return true;
    });
  }, [specs, filter]);

  return (
    <div className="pb-10">
      <PageHeader
        icon={FileText}
        eyebrow="Specifications"
        title="Every feature becomes a spec"
        description="RFC-style documents with purpose, goals, acceptance criteria, technical notes, risks, and review/approval state."
        actions={
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> New RFC
          </Button>
        }
      />

      <div className="border-b border-border px-6">
        <div className="flex items-center gap-1 py-2">
          {FILTER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === t.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/40"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-6 py-5">
        {filtered.map((s) => (
          <SpecRow key={s.id} specId={s.id} number={s.number} title={s.title} status={s.status} updatedAt={s.updatedAt} progress={s.implementationProgress} purpose={s.purpose} />
        ))}
      </div>
    </div>
  );
}

function SpecRow({
  specId,
  number,
  title,
  status,
  updatedAt,
  progress,
  purpose,
}: {
  specId: string;
  number: string;
  title: string;
  status: "draft" | "review" | "approved" | "implementing" | "shipped";
  updatedAt: number;
  progress: number;
  purpose: string;
}) {
  const plan = usePlanForSpec(specId);
  const tasks = useTasksForSpec(specId);
  const doneTasks = tasks?.filter((t) => t.status === "done").length ?? 0;
  return (
    <Link
      href={`/specs/${specId}`}
      className="block rounded-lg border border-border bg-card p-4 transition-all hover:border-border/80 hover:bg-accent/20"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{number}</span>
        <SpecStatusBadge status={status} />
        {plan && plan.status === "awaiting_approval" && (
          <Badge variant="warning" className="gap-1">
            <Sparkles className="h-3 w-3" /> Plan awaiting approval
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">Updated {formatRelativeTime(updatedAt)}</span>
      </div>
      <h3 className="mt-1.5 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground text-pretty">{purpose}</p>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex min-w-[200px] flex-1 items-center gap-2">
          <span className="text-muted-foreground">Implementation</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">{progress}%</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <ListTodo className="h-3.5 w-3.5" />
          {pluralize(doneTasks, "task")} done · {tasks?.length ?? 0} total
        </div>
      </div>
    </Link>
  );
}
