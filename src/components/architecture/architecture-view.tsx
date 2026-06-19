"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Boxes } from "lucide-react";
import { systemsRepo, archRepo } from "@/lib/db/repos";
import type { System } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemEditor } from "./system-editor";
import { ArchitectureDiagram } from "./architecture-diagram";

const STATUS_DOT: Record<System["status"], string> = {
  active: "bg-success",
  planned: "bg-warning",
  deprecated: "bg-muted-foreground",
};

export function ArchitectureView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("system");
  const [tab, setTab] = useState<"systems" | "diagram">("systems");

  const systemsRaw = useLiveQuery(
    () => systemsRepo.listByProject(projectId ?? ""),
    [projectId],
  );
  const systems = useMemo(() => systemsRaw ?? [], [systemsRaw]);
  const sorted = useMemo(
    () =>
      [...systems].sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      ),
    [systems],
  );
  const selected = sorted.find((s) => s.id === selectedId) ?? null;

  function select(id: string | null) {
    router.replace(id ? `/architecture?system=${id}` : "/architecture", {
      scroll: false,
    });
  }

  async function createSystem() {
    if (!projectId) return;
    const system = await systemsRepo.create({
      projectId,
      name: "Untitled system",
    });
    setTab("systems");
    select(system.id);
  }

  async function deleteSystem() {
    if (!selected) return;
    await systemsRepo.remove(selected.id);
    await archRepo.remove(selected.id);
    select(null);
  }

  function openSystem(id: string) {
    setTab("systems");
    select(id);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="systems">Systems</TabsTrigger>
            <TabsTrigger value="diagram">Diagram</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {tab === "diagram" ? (
        <div className="min-h-0 flex-1">
          <ArchitectureDiagram onOpen={openSystem} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-72 shrink-0 flex-col border-r border-border">
            <div className="flex items-center justify-between border-b border-border p-2">
              <span className="px-1 text-sm font-medium">Systems</span>
              <Button
                size="icon-sm"
                aria-label="New system"
                onClick={createSystem}
                disabled={!projectId}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1 p-2">
              {sorted.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No systems yet.
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
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          STATUS_DOT[s.status],
                        )}
                      />
                      <span className="flex-1 truncate text-sm font-medium">
                        {s.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant="outline" className="capitalize">
                        {s.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {s.dependencies.length} dep
                        {s.dependencies.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </ScrollArea>
          </div>

          <div className="min-w-0 flex-1">
            {selected ? (
              <SystemEditor
                key={selected.id}
                system={selected}
                allSystems={systems}
                onDelete={deleteSystem}
              />
            ) : (
              <EmptyState
                icon={Boxes}
                title="No system selected"
                description="Map your project's systems, set their health and status, and connect dependencies. Switch to the Diagram tab to see the architecture as a live graph."
                action={
                  <Button onClick={createSystem} disabled={!projectId}>
                    <Plus className="h-4 w-4" /> New system
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
