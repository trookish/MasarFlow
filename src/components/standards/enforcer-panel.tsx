"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ShieldCheck, AlertTriangle, ArrowUpRight } from "lucide-react";
import {
  standardsRepo,
  notesRepo,
  specsRepo,
  tasksRepo,
} from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { runEnforcer, compileStandardPattern, type Violation } from "@/lib/enforce";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const KIND_LABEL = { note: "Note", spec: "Spec", task: "Task" } as const;

export function EnforcerPanel() {
  const projectId = useActiveProjectId();
  const router = useRouter();

  const standardsRaw = useLiveQuery(
    () => standardsRepo.listByProject(projectId),
    [projectId],
  );
  const notesRaw = useLiveQuery(
    () => notesRepo.listByProject(projectId),
    [projectId],
  );
  const specsRaw = useLiveQuery(
    () => specsRepo.listByProject(projectId),
    [projectId],
  );
  const tasksRaw = useLiveQuery(
    () => tasksRepo.listByProject(projectId),
    [projectId],
  );
  const standards = useMemo(() => standardsRaw ?? [], [standardsRaw]);
  const notes = useMemo(() => notesRaw ?? [], [notesRaw]);
  const specs = useMemo(() => specsRaw ?? [], [specsRaw]);
  const tasks = useMemo(() => tasksRaw ?? [], [tasksRaw]);

  const violations = useMemo(
    () => runEnforcer(standards, notes, specs, tasks),
    [standards, notes, specs, tasks],
  );

  const checkable = standards.filter(
    (s) => s.enforced && compileStandardPattern(s.pattern ?? ""),
  ).length;

  const byStandard = useMemo(() => {
    const map = new Map<string, Violation[]>();
    for (const v of violations) {
      const list = map.get(v.standardId) ?? [];
      list.push(v);
      map.set(v.standardId, list);
    }
    return [...map.values()];
  }, [violations]);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              violations.length === 0
                ? "bg-success/15 text-success"
                : "bg-warning/15 text-warning",
            )}
          >
            {violations.length === 0 ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </span>
          <div>
            <div className="text-sm font-semibold">
              {violations.length === 0
                ? "No violations"
                : `${violations.length} violation${violations.length === 1 ? "" : "s"}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {checkable} machine-checkable standard
              {checkable === 1 ? "" : "s"} scanned across notes, specs, and
              tasks.
            </div>
          </div>
        </div>

        {violations.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="All clear"
            description="No content matches a forbidden pattern. Add a regex pattern to an enforced standard to scan for violations."
          />
        ) : (
          byStandard.map((group) => (
            <div
              key={group[0].standardId}
              className="overflow-hidden rounded-lg border border-border"
            >
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
                <span className="text-sm font-medium">
                  {group[0].standardTitle}
                </span>
                <Badge variant="outline" className="capitalize">
                  {group[0].category}
                </Badge>
                <Badge variant="default" className="ml-auto">
                  {group.length}
                </Badge>
              </div>
              <ul className="divide-y divide-border">
                {group.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => router.push(v.href)}
                      className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-accent"
                    >
                      <Badge variant="outline" className="mt-0.5 shrink-0">
                        {KIND_LABEL[v.entityKind]}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{v.entityLabel}</div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {v.snippet}
                        </div>
                      </div>
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
