"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, FileText } from "lucide-react";
import { specsRepo, tasksRepo, notesRepo } from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { specStatusMeta } from "@/lib/workflow";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SpecEditor } from "./spec-editor";

export function SpecsView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("spec");

  const specs = useLiveQuery(
    () => specsRepo.listByProject(projectId),
    [projectId],
  );
  const notes = useLiveQuery(
    () => notesRepo.listByProject(projectId),
    [projectId],
  );
  const tasks = useLiveQuery(
    () => tasksRepo.listByProject(projectId),
    [projectId],
  );

  const allSpecs = useMemo(
    () =>
      [...(specs ?? [])].sort((a, b) => a.number.localeCompare(b.number)),
    [specs],
  );
  const selectedSpec = allSpecs.find((s) => s.id === selectedId) ?? null;
  const linkedTasks = useMemo(
    () =>
      selectedSpec
        ? (tasks ?? []).filter((t) => t.specId === selectedSpec.id)
        : [],
    [tasks, selectedSpec],
  );

  function select(id: string | null) {
    router.replace(id ? `/specs?spec=${id}` : "/specs", { scroll: false });
  }

  async function createSpec() {
    if (!projectId) return;
    const count = (specs ?? []).length;
    const number = `RFC-${String(count + 1).padStart(3, "0")}`;
    const spec = await specsRepo.create({
      projectId,
      number,
      title: "Untitled spec",
    });
    select(spec.id);
  }

  async function deleteSpec() {
    if (!selectedSpec) return;
    await specsRepo.remove(selectedSpec.id);
    select(null);
  }

  async function createTaskForSpec() {
    if (!projectId || !selectedSpec) return;
    await tasksRepo.create({
      projectId,
      title: "New task",
      specId: selectedSpec.id,
      status: "todo",
    });
    await specsRepo.recomputeProgress(selectedSpec.id);
  }

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between border-b border-border p-2">
          <span className="px-1 text-sm font-medium">Specifications</span>
          <Button
            size="icon-sm"
            aria-label="New spec"
            onClick={createSpec}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          {allSpecs.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No specs yet.
            </p>
          ) : (
            allSpecs.map((s) => {
              const meta = specStatusMeta(s.status);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => select(s.id)}
                  className={cn(
                    "mb-1 w-full rounded-md border px-3 py-2 text-left",
                    s.id === selectedId
                      ? "border-border bg-accent"
                      : "border-transparent hover:bg-accent/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {s.number}
                    </span>
                    <Badge className={cn("ml-auto shrink-0", meta.badge)}>
                      {meta.label}
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium">
                    {s.title}
                  </div>
                </button>
              );
            })
          )}
        </ScrollArea>
      </div>

      <div className="min-w-0 flex-1">
        {selectedSpec ? (
          <SpecEditor
            key={selectedSpec.id}
            spec={selectedSpec}
            notes={notes ?? []}
            linkedTasks={linkedTasks}
            onDelete={deleteSpec}
            onOpenTask={(taskId) => router.push(`/tasks?task=${taskId}`)}
            onCreateTask={createTaskForSpec}
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="No spec selected"
            description="Specifications turn an idea into an RFC with goals, constraints, and acceptance criteria — then link tasks to track implementation."
            action={
              <Button onClick={createSpec} disabled={!projectId}>
                <Plus className="h-4 w-4" /> New spec
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
