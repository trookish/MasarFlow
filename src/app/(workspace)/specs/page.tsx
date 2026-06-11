"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Sparkles, ListTodo, Pencil, GitBranch } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SpecStatusBadge } from "@/components/common/badges";
import { SpecEditorDialog } from "@/components/common/spec-editor-dialog";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useSpecs, usePlanForSpec, useTasksForSpec } from "@/lib/db/repos/specs";
import { type Spec, type SpecStatus } from "@/lib/db/schema";
import { formatRelativeTime, pluralize, cn } from "@/lib/utils";

type FilterId = "all" | "draft" | "review" | "active" | "shipped";
const FILTER_TABS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "review", label: "In Review" },
  { id: "draft", label: "Draft" },
  { id: "shipped", label: "Shipped" },
];

export default function SpecsPage() {
  const router = useRouter();
  const project = useActiveProject();
  const specs = useSpecs(project?.id);
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Spec | undefined>(undefined);

  const filtered = React.useMemo(() => {
    return (specs ?? []).filter((s) => {
      if (filter === "all") return true;
      if (filter === "active") return s.status === "implementing" || s.status === "approved";
      if (filter === "review") return s.status === "review";
      if (filter === "draft") return s.status === "draft";
      if (filter === "shipped") return s.status === "shipped";
      return true;
    });
  }, [specs, filter]);

  const counts = React.useMemo(() => {
    const c: Record<FilterId, number> = { all: 0, active: 0, review: 0, draft: 0, shipped: 0 };
    (specs ?? []).forEach((s) => {
      c.all++;
      if (s.status === "implementing" || s.status === "approved") c.active++;
      if (s.status === "review") c.review++;
      if (s.status === "draft") c.draft++;
      if (s.status === "shipped") c.shipped++;
    });
    return c;
  }, [specs]);

  const onNew = () => {
    setEditing(undefined);
    setEditorOpen(true);
  };

  const onEdit = (e: React.MouseEvent, s: Spec) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing(s);
    setEditorOpen(true);
  };

  return (
    <div className="pb-10">
      <PageHeader
        icon={FileText}
        eyebrow="Specifications"
        title="Every feature becomes a spec"
        description="RFC-style documents with purpose, goals, acceptance criteria, technical notes, risks, and review/approval state."
        actions={
          <Button className="gap-2" onClick={onNew}>
            <Plus className="h-4 w-4" /> New RFC
          </Button>
        }
      />

      <div className="border-b border-border px-6">
        <div className="flex items-center gap-1 py-2 overflow-x-auto">
          {FILTER_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                filter === t.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/40",
              )}
            >
              {t.label}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">{counts[t.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-6 py-5">
        {filtered.map((s) => (
          <SpecRow key={s.id} spec={s} onEdit={onEdit} />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No specs match this filter. <button onClick={onNew} className="text-primary hover:underline">Create one</button>.
          </div>
        )}
      </div>

      <SpecEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        spec={editing}
        onCreated={(id) => router.push(`/specs/${id}`)}
      />
    </div>
  );
}

function SpecRow({ spec, onEdit }: { spec: Spec; onEdit: (e: React.MouseEvent, s: Spec) => void }) {
  const plan = usePlanForSpec(spec.id);
  const tasks = useTasksForSpec(spec.id);
  const doneTasks = tasks?.filter((t) => t.status === "done").length ?? 0;
  return (
    <div className="group relative rounded-lg border border-border bg-card transition-all hover:border-border/80">
      <Link href={`/specs/${spec.id}`} className="block p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{spec.number}</span>
          <SpecStatusBadge status={spec.status} />
          {plan && plan.status === "awaiting_approval" && (
            <Badge variant="warning" className="gap-1"><Sparkles className="h-3 w-3" />Plan awaiting approval</Badge>
          )}
          {plan && plan.status === "approved" && (
            <Badge variant="info" className="gap-1"><GitBranch className="h-3 w-3" />Plan approved</Badge>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">Updated {formatRelativeTime(spec.updatedAt)}</span>
        </div>
        <h3 className="mt-1.5 text-base font-semibold tracking-tight">{spec.title}</h3>
        <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground text-pretty">{spec.purpose}</p>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex min-w-[200px] flex-1 items-center gap-2">
            <span className="text-muted-foreground">Implementation</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${spec.implementationProgress}%` }} />
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{spec.implementationProgress}%</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ListTodo className="h-3.5 w-3.5" />
            {pluralize(doneTasks, "task")} done · {tasks?.length ?? 0} total
          </div>
        </div>
      </Link>
      <button
        onClick={(e) => onEdit(e, spec)}
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        aria-label="Edit spec"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
