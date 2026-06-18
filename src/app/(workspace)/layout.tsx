"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { GlobalSearch } from "@/components/shell/global-search";
import { ShortcutsDialog } from "@/components/shell/shortcuts-dialog";
import { useGlobalHotkeys } from "@/lib/hooks/use-hotkeys";
import { useProjectStore } from "@/lib/stores/project";
import { projectsRepo } from "@/lib/db/repos";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useGlobalHotkeys();
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
