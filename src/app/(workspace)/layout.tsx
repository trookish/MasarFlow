"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { GlobalSearch } from "@/components/shell/global-search";
import { ShortcutsDialog } from "@/components/shell/shortcuts-dialog";
import { PythonRequiredScreen } from "@/components/shell/python-required-screen";
import { useGlobalHotkeys } from "@/lib/hooks/use-hotkeys";
import { usePythonHealth } from "@/lib/hooks/use-python-health";
import { useProjectStore } from "@/lib/stores/project";
import { projectsRepo } from "@/lib/db/repos";
import {
  startPeriodicEmbeddingSync,
  stopPeriodicEmbeddingSync,
} from "@/lib/ai/embedding-sync";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useGlobalHotkeys();
  const { state: pythonState } = usePythonHealth();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);

  // Guarantee an active, existing project on mount (and after a data reset).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = activeProjectId
        ? await projectsRepo.get(activeProjectId)
        : undefined;
      if (!existing) {
        const id = await projectsRepo.ensureDefault();
        if (!cancelled) setActiveProjectId(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, setActiveProjectId]);

  // Background reindex of the local AI service's vector index. A no-op while
  // the service is down; the boot gate below keeps the user out of the shell
  // until it's reachable anyway.
  useEffect(() => {
    startPeriodicEmbeddingSync(() => useProjectStore.getState().activeProjectId);
    return () => stopPeriodicEmbeddingSync();
  }, []);

  // Hard boot gate: Python is a required runtime. Hold the shell until the
  // service is green (the hook auto-polls while down/checking).
  if (pythonState !== "ok") {
    return <PythonRequiredScreen />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <CommandPalette />
      <GlobalSearch />
      <ShortcutsDialog />
    </div>
  );
}
