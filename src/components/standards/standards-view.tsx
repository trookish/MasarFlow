"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, ShieldCheck, ShieldOff, AlertTriangle } from "lucide-react";
import {
  standardsRepo,
  notesRepo,
  specsRepo,
  tasksRepo,
} from "@/lib/db/repos";
import { runEnforcer } from "@/lib/enforce";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StandardEditor } from "./standard-editor";
import { EnforcerPanel } from "./enforcer-panel";

export function StandardsView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("standard");
  const { autoValidate, showLineNumbers } = usePageSettings((s) => s.standards);
  const [tab, setTab] = useState<"catalog" | "enforcer">("catalog");

  const standardsRaw = useLiveQuery(
    () => standardsRepo.listByProject(projectId),
    [projectId],
  );
  const standards = useMemo(() => standardsRaw ?? [], [standardsRaw]);

  // Live violation count, computed only when auto-validate is enabled.
  const notesRaw = useLiveQuery(
    () => (autoValidate ? notesRepo.listByProject(projectId) : []),
    [projectId, autoValidate],
  );
  const specsRaw = useLiveQuery(
    () => (autoValidate ? specsRepo.listByProject(projectId) : []),
    [projectId, autoValidate],
  );
  const tasksRaw = useLiveQuery(
    () => (autoValidate ? tasksRepo.listByProject(projectId) : []),
    [projectId, autoValidate],
  );
  const violationCount = useMemo(() => {
    if (!autoValidate) return 0;
    return runEnforcer(
      standards,
      notesRaw ?? [],
      specsRaw ?? [],
      tasksRaw ?? [],
    ).length;
  }, [autoValidate, standards, notesRaw, specsRaw, tasksRaw]);
  const sorted = useMemo(
    () =>
      [...standards].sort(
        (a, b) =>
          a.category.localeCompare(b.category) ||
          a.title.localeCompare(b.title),
      ),
    [standards],
  );
  const usedCategories = useMemo(
    () => [...new Set(standards.map((s) => s.category))],
    [standards],
  );
  const selected = sorted.find((s) => s.id === selectedId) ?? null;

  function select(id: string | null) {
    router.replace(id ? `/standards?standard=${id}` : "/standards", {
      scroll: false,
    });
  }

  async function createStandard() {
    if (!projectId) return;
    const standard = await standardsRepo.create({
      projectId,
      title: "Untitled standard",
      rule: "",
    });
    select(standard.id);
  }

  async function deleteStandard() {
    if (!selected) return;
    await standardsRepo.remove(selected.id);
    select(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="enforcer">Enforcer</TabsTrigger>
          </TabsList>
        </Tabs>
        {autoValidate && (
          <button
            type="button"
            onClick={() => setTab("enforcer")}
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              violationCount === 0
                ? "bg-success/15 text-success"
                : "bg-warning/15 text-warning",
            )}
          >
            {violationCount === 0 ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {violationCount === 0
              ? "No violations"
              : `${violationCount} violation${violationCount === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {tab === "enforcer" ? (
        <div className="min-h-0 flex-1">
          <EnforcerPanel />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-72 shrink-0 flex-col border-r border-border">
            <div className="flex items-center justify-between border-b border-border p-2">
              <span className="px-1 text-sm font-medium">Standards</span>
              <Button
                size="icon-sm"
                aria-label="New standard"
                onClick={createStandard}
                disabled={!projectId}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              {sorted.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No standards yet.
                </p>
              ) : (
                sorted.map((s) => (
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
                      <span className="flex-1 truncate text-sm font-medium">
                        {s.title}
                      </span>
                      {s.enforced ? (
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <ShieldOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <Badge variant="outline" className="mt-1 capitalize">
                      {s.category}
                    </Badge>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>

          <div className="min-w-0 flex-1">
            {selected ? (
              <StandardEditor
                key={selected.id}
                standard={selected}
                showLineNumbers={showLineNumbers}
                usedCategories={usedCategories}
                onDelete={deleteStandard}
              />
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No standard selected"
                description="Catalog your coding rules by category. Give a rule a forbidden regex pattern and the Enforcer scans notes, specs, and tasks for violations."
                action={
                  <Button onClick={createStandard} disabled={!projectId}>
                    <Plus className="h-4 w-4" /> New standard
                  </Button>
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
