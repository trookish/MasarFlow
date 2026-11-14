"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Circle,
  AlertTriangle,
  FileText,
  ListTodo,
  Pencil,
  Check,
  X,
  Plus,
  Wand2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/common/page-skeleton";
import { EntityNotFound } from "@/components/common/entity-not-found";
import { SpecStatusBadge, TaskPriorityBadge } from "@/components/common/badges";
import { SpecEditorDialog } from "@/components/common/spec-editor-dialog";
import { TaskEditorDialog } from "@/components/common/task-editor-dialog";
import { useSpec, usePlanForSpec, useTasksForSpec } from "@/lib/db/repos/specs";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useNotes } from "@/lib/db/repos/notes";
import { useStandards } from "@/lib/db/repos/misc";
import { ViolationsPanel } from "@/components/standards/violations-panel";
import { checkSpecAgainstStandards } from "@/lib/standards/enforcer";
import {
  getDb,
  type Spec,
  type Task,
  type TaskStatus,
  type Plan,
  type SpecStatus,
} from "@/lib/db/schema";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { markdownToHtml } from "@/lib/markdown/render";

export default function SpecDetailPage() {
  const params = useParams<{ specId: string }>();
  const spec = useSpec(params.specId);
  const plan = usePlanForSpec(params.specId);
  const tasks = useTasksForSpec(params.specId);
  const project = useActiveProject();
  const allNotes = useNotes(project?.id);
  const standards = useStandards(project?.id);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [taskEditorOpen, setTaskEditorOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | undefined>(undefined);

  const specViolations = React.useMemo(() => {
    if (!spec || !standards) return [];
    return checkSpecAgainstStandards(spec, standards);
  }, [spec, standards]);

  if (spec === undefined) return <PageSkeleton />;
  if (!spec) {
    return (
      <EntityNotFound
        icon={FileText}
        title="Spec not found"
        description="The specification you're looking for doesn't exist or has been deleted."
        backHref="/specs"
        backLabel="Back to specifications"
      />
    );
  }

  const onApprovePlan = async () => {
    if (!plan) return;
    await getDb().plans.put({ ...plan, status: "approved" });
    if (spec.status === "draft" || spec.status === "review") {
      await getDb().specs.put({ ...spec, status: "approved", updatedAt: Date.now() });
    }
    toast.success("Plan approved", { description: "AI can now begin implementation." });
  };

  const onRejectPlan = async () => {
    if (!plan) return;
    await getDb().plans.put({ ...plan, status: "rejected" });
    toast.warning("Plan rejected", { description: "AI will revise on next request." });
  };

  const onAutoCreateTasks = async () => {
    if (!plan) return;
    toast.info("Auto-creating tasks...");
    const newTasks = plan.roadmap.map((r, i) => ({
      id: `task_${plan.id}_${Date.now()}_${i}`,
      projectId: spec.projectId,
      title: r,
      description: `Auto-generated from plan for ${spec.title}`,
      status: "backlog" as const,
      priority: "medium" as const,
      specId: spec.id,
      parentTaskId: null,
      sprintId: null,
      assignee: "human" as const,
      dependencies: [],
      progress: 0,
      tags: ["auto-generated"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    await getDb().tasks.bulkAdd(newTasks);
    toast.success(`Created ${newTasks.length} tasks and added them to backlog`);
  };

  const onGeneratePlan = async () => {
    if (!spec) return;
    toast.info("AI Planner running", { description: "Simulated planner. Real agents land in S4." });
    const newPlan: Plan = {
      id: plan?.id ?? `plan_${spec.id}`,
      specId: spec.id,
      summary: `Simulated plan for ${spec.title}. Affected: ${spec.dependencies.join(", ") || "none"}.`,
      affectedSystems: spec.dependencies,
      conflicts: [],
      archImpact: "No breaking changes. Adds new state to dispatcher.",
      alternatives: [
        "Animator-driven (rejected in ADR-007)",
        "Behavior tree (rejected as too heavy)",
      ],
      complexity: "high",
      risks: spec.risks.length > 0 ? spec.risks : ["No risks identified yet."],
      roadmap: [
        "Bake surface manifest tool (2d)",
        "Sphere-cast runtime check (1d)",
        "Implementation state class (2d)",
        "Integration tests (1d)",
        "Polish + perf pass (2d)",
      ],
      status: "awaiting_approval",
      createdAt: Date.now(),
    };
    await getDb().plans.put(newPlan);
    toast.success("Plan generated", { description: "Review and approve to continue." });
  };

  const onStatusChange = async (status: SpecStatus) => {
    await getDb().specs.put({ ...spec, status, updatedAt: Date.now() });
    toast.success(`Status set to ${status}`);
  };

  const onTaskStatusChange = async (t: Task, status: TaskStatus) => {
    const u: Task = {
      ...t,
      status,
      updatedAt: Date.now(),
      progress:
        status === "done" ? 100 : status === "in_progress" ? Math.max(t.progress, 25) : t.progress,
    };
    await getDb().tasks.put(u);
    const all = tasks ?? [];
    const total = all.length || 1;
    const done = all.filter((x) =>
      x.id === t.id ? status === "done" : x.status === "done",
    ).length;
    const progress = Math.round((done / total) * 100);
    if (progress !== spec.implementationProgress) {
      await getDb().specs.put({ ...spec, implementationProgress: progress, updatedAt: Date.now() });
    }
    if (status === "done" && all.every((x) => (x.id === t.id ? true : x.status === "done"))) {
      await getDb().specs.put({
        ...spec,
        status: "shipped",
        implementationProgress: 100,
        updatedAt: Date.now(),
      });
      toast.success("All tasks done - spec shipped");
    }
  };

  const onDeleteTask = async (t: Task) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    await getDb().tasks.delete(t.id);
    toast.success("Task deleted");
  };

  const onNewTask = () => {
    setEditingTask(undefined);
    setTaskEditorOpen(true);
  };
  const onEditTask = (t: Task) => {
    setEditingTask(t);
    setTaskEditorOpen(true);
  };

  return (
    <div className="pb-10">
      <div className="border-border bg-background/85 sticky top-0 z-20 flex items-center justify-between gap-2 border-b px-6 py-2.5 backdrop-blur">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/specs" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to specifications
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <StatusQuickSwitcher spec={spec} onChange={onStatusChange} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditorOpen(true)}
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </div>
      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-muted-foreground font-mono text-[10px]">{spec.number}</span>
              <SpecStatusBadge status={spec.status} />
              <span className="text-muted-foreground ml-auto text-[10px]">
                Updated {formatRelativeTime(spec.updatedAt)}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance">{spec.title}</h1>
            {spec.purpose ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-2xl mt-2"
                dangerouslySetInnerHTML={{ __html: markdownToHtml(spec.purpose) }}
              />
            ) : (
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm text-pretty">
                <em className="opacity-60">No purpose written yet.</em>
              </p>
            )}
          </div>
          {spec.goals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Goals</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {spec.goals.map((g) => (
                    <li key={g} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-[color:var(--success)]" />
                      <span className="text-pretty">{g}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {spec.features.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Features</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-pretty">
                  {spec.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 text-[color:var(--primary)]" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {spec.acceptance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Acceptance criteria</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {spec.acceptance.map((a) => (
                    <li key={a} className="border-border rounded-md border p-2.5">
                      <div className="flex items-start gap-2">
                        <Circle className="text-muted-foreground mt-0.5 h-3.5 w-3.5" />
                        <span className="text-pretty">{a}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {spec.technicalNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Technical notes</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm leading-relaxed text-pretty">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(spec.technicalNotes) }}
                />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListTodo className="h-3.5 w-3.5" />
                  Tasks
                </CardTitle>
                <CardDescription>Each task links back to this spec.</CardDescription>
              </div>
              <Button size="sm" className="gap-1" onClick={onNewTask}>
                <Plus className="h-3.5 w-3.5" />
                New task
              </Button>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {(tasks ?? []).length === 0 && (
                <div className="border-border text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
                  No tasks yet. Add the first one to start the implementation.
                </div>
              )}
              {(tasks ?? []).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onStatusChange={onTaskStatusChange}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-4 lg:col-span-4">
          <PlanPanel
            spec={spec}
            plan={plan}
            onGenerate={onGeneratePlan}
            onApprove={onApprovePlan}
            onReject={onRejectPlan}
            onAutoCreateTasks={onAutoCreateTasks}
          />
          <ViolationsPanel violations={specViolations} title="Spec standards" />
          {spec.constraints.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Constraints</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-muted-foreground space-y-1.5 text-xs">
                  {spec.constraints.map((c) => (
                    <li key={c} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3 w-3 text-[color:var(--warning)]" />
                      <span className="text-pretty">{c}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {spec.risks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Risks</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  {spec.risks.map((r) => (
                    <li key={r} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3 w-3 text-[color:var(--warning)]" />
                      <span className="text-pretty">{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {spec.dependencies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Dependencies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {spec.dependencies.map((d) => {
                    const linked = allNotes?.find((n) => n.id === d);
                    return linked ? (
                      <Link
                        key={d}
                        href={`/brain/${linked.id}`}
                        className="border-border bg-accent/40 text-primary inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] hover:underline"
                      >
                        {d}
                      </Link>
                    ) : (
                      <Badge key={d} variant="outline" className="font-mono text-[10px]">
                        {d}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {spec.futureImprovements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Future improvements</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  {spec.futureImprovements.map((f) => (
                    <li key={f} className="text-pretty">
                      - {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-3.5 w-3.5" />
                Linked notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {spec.linkedNoteIds.length === 0 ? (
                <p className="text-muted-foreground">No notes linked.</p>
              ) : (
                spec.linkedNoteIds.map((id) => {
                  const linked = allNotes?.find((n) => n.id === id);
                  return linked ? (
                    <Link
                      key={id}
                      href={`/brain/${linked.id}`}
                      className="text-muted-foreground hover:bg-accent/40 hover:text-foreground block truncate rounded-md px-2 py-1"
                    >
                      {linked.title}
                    </Link>
                  ) : (
                    <span
                      key={id}
                      className="text-muted-foreground block truncate rounded-md px-2 py-1"
                    >
                      {id}
                    </span>
                  );
                })
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
      <SpecEditorDialog open={editorOpen} onOpenChange={setEditorOpen} spec={spec} />
      <TaskEditorDialog
        open={taskEditorOpen}
        onOpenChange={setTaskEditorOpen}
        spec={spec}
        task={editingTask}
      />
    </div>
  );
}

function StatusQuickSwitcher({
  spec,
  onChange,
}: {
  spec: Spec;
  onChange: (s: SpecStatus) => void;
}) {
  const STATUSES: SpecStatus[] = ["draft", "review", "approved", "implementing", "shipped"];
  return (
    <div className="border-border bg-surface-2 flex items-center rounded-md border p-0.5 text-[10px]">
      {STATUSES.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            "rounded-sm px-2 py-0.5 capitalize transition-colors",
            spec.status === s
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function PlanPanel({
  spec,
  plan,
  onGenerate,
  onApprove,
  onReject,
  onAutoCreateTasks,
}: {
  spec: Spec | undefined | null;
  plan: Plan | undefined | null;
  onGenerate: () => void;
  onApprove: () => void;
  onReject: () => void;
  onAutoCreateTasks: () => void;
}) {
  if (!plan) {
    return (
      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--primary)]" />
            AI Plan
          </CardDescription>
          <CardTitle className="mt-1 text-sm">No plan yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-3 text-xs">
            Ask the AI Planner to draft a step-by-step implementation, including affected systems,
            risks, and a roadmap.
          </p>
          <Button size="sm" onClick={onGenerate} className="w-full gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            Generate plan
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[color:var(--primary)]" />
          AI Plan
          <Badge
            variant={
              plan.status === "approved"
                ? "success"
                : plan.status === "awaiting_approval"
                  ? "warning"
                  : plan.status === "rejected"
                    ? "danger"
                    : "ghost"
            }
            className="ml-1.5 capitalize"
          >
            {plan.status.replace("_", " ")}
          </Badge>
        </CardDescription>
        <CardTitle className="mt-1 text-sm">{spec?.number} roadmap</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <p className="text-pretty">{plan.summary}</p>
        <div className="space-y-1">
          <div className="text-muted-foreground">Complexity</div>
          <Badge
            variant={
              plan.complexity === "epic"
                ? "danger"
                : plan.complexity === "high"
                  ? "warning"
                  : "info"
            }
          >
            {plan.complexity}
          </Badge>
        </div>
        {plan.archImpact && (
          <div>
            <div className="text-muted-foreground mb-1">Architecture impact</div>
            <p className="border-border bg-surface-2 text-foreground/80 rounded-md border p-2 text-pretty">
              {plan.archImpact}
            </p>
          </div>
        )}
        {plan.roadmap.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">Roadmap</div>
            <ol className="list-inside list-decimal space-y-1 text-pretty">
              {plan.roadmap.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
        )}
        {plan.alternatives.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">Alternatives</div>
            <ul className="text-muted-foreground space-y-0.5 text-pretty">
              {plan.alternatives.map((a) => (
                <li key={a}>- {a}</li>
              ))}
            </ul>
          </div>
        )}
        {plan.risks.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1">Risks</div>
            <ul className="text-muted-foreground space-y-0.5 text-pretty">
              {plan.risks.map((r) => (
                <li key={r}>- {r}</li>
              ))}
            </ul>
          </div>
        )}
        {plan.status === "awaiting_approval" && (
          <div className="flex items-center gap-1.5 rounded-md border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 p-2.5 text-[color:var(--warning)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Awaiting your approval</span>
          </div>
        )}
        <div className="border-border flex items-center gap-1.5 border-t pt-2 mt-4">
          {plan.status !== "approved" && (
            <Button size="sm" variant="soft" onClick={onApprove} className="gap-1">
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
          )}
          {plan.status === "approved" && (
            <Button size="sm" variant="soft" onClick={onAutoCreateTasks} className="gap-1">
              <Wand2 className="h-3.5 w-3.5" />
              Auto-Create Tasks
            </Button>
          )}
          {plan.status === "awaiting_approval" && (
            <Button size="sm" variant="outline" onClick={onReject} className="gap-1">
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onGenerate} className="ml-auto gap-1">
            <Wand2 className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskRow({
  task,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  task: Task;
  onStatusChange: (t: Task, s: TaskStatus) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  return (
    <div className="group border-border/60 flex items-center gap-2 rounded-md border p-2 text-sm">
      <select
        value={task.status}
        onChange={(e) => onStatusChange(task, e.target.value as TaskStatus)}
        className="border-border bg-background h-6 rounded border px-1.5 text-[10px] capitalize"
      >
        {["backlog", "todo", "in_progress", "review", "done"].map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
      <span className="flex-1 truncate">{task.title}</span>
      <TaskPriorityBadge priority={task.priority} />
      <span className="text-muted-foreground font-mono text-[10px]">{task.assignee}</span>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onEdit(task)}
          className="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1"
          aria-label="Edit task"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={() => onDelete(task)}
          className="text-muted-foreground hover:bg-accent rounded p-1 hover:text-[color:var(--danger)]"
          aria-label="Delete task"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
