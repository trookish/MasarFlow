"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { GlobalSearch } from "@/components/shell/global-search";
import { ShortcutsDialog } from "@/components/shell/shortcuts-dialog";
import { NewProjectDialog } from "@/components/shell/new-project-dialog";
import { PythonRequiredScreen } from "@/components/shell/python-required-screen";
import { useGlobalHotkeys } from "@/lib/hooks/use-hotkeys";
import { usePythonHealth } from "@/lib/hooks/use-python-health";
import { useProjectStore } from "@/lib/stores/project";
import { useActiveProject } from "@/lib/hooks/use-project";
import { useUpdatesStore } from "@/lib/stores/updates";
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
  const activeProject = useActiveProject();
  const projectCount = useLiveQuery(() => projectsRepo.count(), []);

  // Banner as the workspace background (background mode).
  const projectBackground =
    activeProject?.bannerMode === "background" && activeProject.banner
      ? {
          image: activeProject.banner,
          blur: activeProject.bannerBlur ?? 0,
          brightness: activeProject.bannerBrightness ?? 100,
        }
      : null;

  // First run: no projects yet — prompt the user to create one. Closing the
  // dialog (backdrop/Escape) falls back to a default project so the workspace
  // always resolves to a real project. Re-appears after "Reset all data".
  const firstRunOpen = projectCount === 0;

  // Guarantee an active, existing project (skipped while the first-run prompt
  // is shown — creating/skipping the prompt handles that state).
  useEffect(() => {
    if (projectCount === undefined || projectCount === 0) return;
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
  }, [projectCount, activeProjectId, setActiveProjectId]);

  async function firstRunSkip() {
    const id = await projectsRepo.ensureDefault();
    setActiveProjectId(id);
  }

  // Background reindex of the local AI service's vector index. A no-op while
  // the service is down; the boot gate below keeps the user out of the shell
  // until it's reachable anyway.
  useEffect(() => {
    startPeriodicEmbeddingSync(
      () => useProjectStore.getState().activeProjectId,
    );
    return () => stopPeriodicEmbeddingSync();
  }, []);

  // Auto-check for updates on startup (toggleable in Settings → Updates).
  // Silently fills the store so the topbar shows a dot when a newer release
  // exists; the manual button opens the details dialog.
  useEffect(() => {
    if (useUpdatesStore.getState().autoCheck) {
      void useUpdatesStore.getState().check();
    }
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
        <main className="relative min-h-0 flex-1 overflow-hidden">
          {projectBackground ? (
            <div
              aria-hidden
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${projectBackground.image})`,
                filter: `blur(${projectBackground.blur}px) brightness(${projectBackground.brightness}%)`,
              }}
            />
          ) : null}
          <div className="relative z-10 h-full">{children}</div>
        </main>
      </div>
      <CommandPalette />
      <GlobalSearch />
      <ShortcutsDialog />
      <NewProjectDialog
        key={String(firstRunOpen)}
        open={firstRunOpen}
        mode="first-run"
        onOpenChange={(open) => {
          if (!open && firstRunOpen) void firstRunSkip();
        }}
        onCreated={(id) => setActiveProjectId(id)}
        onFirstRunSkip={() => void firstRunSkip()}
      />
    </div>
  );
}
