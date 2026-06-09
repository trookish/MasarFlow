"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2, Circle, AlertTriangle, FileText, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SpecStatusBadge, TaskStatusBadge, TaskPriorityBadge } from "@/components/common/badges";
import { useSpec, usePlanForSpec, useTasksForSpec } from "@/lib/db/repos/specs";
import { formatRelativeTime } from "@/lib/utils";

export default function SpecDetailPage() {
  const params = useParams<{ specId: string }>();
  const spec = useSpec(params.specId);
  const plan = usePlanForSpec(params.specId);
  const tasks = useTasksForSpec(params.specId);

  if (!spec) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/specs" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="border-b border-border px-6 py-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/specs" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to specifications
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 px-6 py-5 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">{spec.number}</span>
              <SpecStatusBadge status={spec.status} />
              <span className="ml-auto text-[10px] text-muted-foreground">
                Updated {formatRelativeTime(spec.updatedAt)}
              </span>
            </div>
            <h1 className="text-balance text-3xl font-semibold tracking-tight">{spec.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground text-pretty">{spec.purpose}</p>
          </div>

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

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Acceptance criteria</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {spec.acceptance.map((a) => (
                  <li key={a} className="rounded-md border border-border p-2.5">
                    <div className="flex items-start gap-2">
                      <Circle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-pretty">{a}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Technical notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {spec.technicalNotes}
            </CardContent>
          </Card>

          {tasks && tasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListTodo className="h-3.5 w-3.5" /> Implementation tasks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm">
                    <TaskStatusBadge status={t.status} />
                    <span className="flex-1 truncate">{t.title}</span>
                    <TaskPriorityBadge priority={t.priority} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:col-span-4">
          {plan && (
            <Card>
              <CardHeader>
                <CardDescription className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[color:var(--primary)]" /> AI Plan
                </CardDescription>
                <CardTitle className="mt-1 text-sm">{plan.id}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <p className="text-pretty">{plan.summary}</p>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Complexity</div>
                  <Badge variant={plan.complexity === "epic" ? "danger" : plan.complexity === "high" ? "warning" : "info"}>
                    {plan.complexity}
                  </Badge>
                </div>
                <div>
                  <div className="mb-1 text-muted-foreground">Roadmap</div>
                  <ol className="list-inside list-decimal space-y-1 text-pretty">
                    {plan.roadmap.slice(0, 5).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ol>
                </div>
                {plan.status === "awaiting_approval" && (
                  <div className="rounded-md border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 p-2.5">
                    <div className="flex items-center gap-1.5 text-[color:var(--warning)]">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="font-medium">Awaiting your approval</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Risks</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {spec.risks.map((r) => (
                  <li key={r} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3 w-3 text-[color:var(--warning)]" />
                    <span className="text-pretty">{r}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Dependencies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {spec.dependencies.map((d) => (
                  <Badge key={d} variant="outline" className="font-mono text-[10px]">
                    {d}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-3.5 w-3.5" /> Linked notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {spec.linkedNoteIds.map((id) => (
                <Link
                  key={id}
                  href={`/brain/${id}`}
                  className="block truncate rounded-md px-2 py-1 text-muted-foreground hover:bg-accent/40"
                >
                  {id}
                </Link>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
