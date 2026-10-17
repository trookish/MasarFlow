"use client";

import { useCallback, useEffect, Suspense, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { CommandPalette } from "@/components/shell/command-palette";
import { QuickSwitcher } from "@/components/vault/quick-switcher";
import { Toaster } from "@/components/ui/toaster";
import { GlobalSearch } from "@/components/shell/global-search";
import { ShortcutsDialog } from "@/components/shell/shortcuts-dialog";
import { NewProjectDialog } from "@/components/shell/new-project-dialog";
import { SetupWizard } from "@/components/onboarding/setup-wizard";
import { SecretsBootstrap } from "@/components/shell/secrets-bootstrap";
import { AutoBackup } from "@/components/shell/auto-backup";
import { DbGate } from "@/components/shell/db-gate";
import { useGlobalHotkeys } from "@/lib/hooks/use-hotkeys";
import { useDesktopNavigation } from "@/lib/hooks/use-desktop-navigation";
import { useProjectStore } from "@/lib/stores/project";
import { useUIStore } from "@/lib/stores/ui";
import { useActiveProject } from "@/lib/hooks/use-project";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useUpdatesStore } from "@/lib/stores/updates";
import { useDockSync } from "@/lib/hooks/use-dock-sync";
import { useActivityTracking } from "@/lib/hooks/use-activity-tracking";
import { DockWorkspace } from "@/components/dock/dock-workspace";
import { getDesktop } from "@/lib/desktop/bridge";
import { shouldShowWizard } from "@/lib/onboarding/state";
import { projectsRepo } from "@/lib/db/repos";
import {
  startPeriodicEmbeddingSync,
  stopPeriodicEmbeddingSync,
} from "@/lib/ai/embedding-sync";

/**
 * Dock mode runtime: runs the URL<->dock sync and renders the dock
 * workspace. Wrapped in Suspense by the layout because useDockSync reads
 * search params (client-side; no server rendering involved).
 */
function DockWorkspaceLive() {
  useDockSync();
  return <DockWorkspace />;
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useGlobalHotkeys();
  // P10.T11: the tray can ask the shell to navigate (Control Center).
  useDesktopNavigation();
  // Runs in dock and classic mode alike (useDockSync only mounts with the dock).
  useActivityTracking();
  const mounted = useMounted();
  const taskbarDirection = useUIStore((s) => s.taskbarDirection);
  const dockEnabled = useUIStore((s) => s.dockEnabled);
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

  // First run (P10): the wizard replaces the bare project dialog when the
  // desktop app has never finished setup. `?setup=1` forces it (the Control
  // Center button and e2e). Read from window.location, not useSearchParams:
  // this is the root client layout and a searchParams read here would force
  // every page into a CSR bailout (see the dock Suspense below).
  const [wizardForced, setWizardForced] = useState(false);
  const [installSettings, setInstallSettings] = useState<{ onboardingCompletedAt: string | null } | null>(null);
  const loadInstallState = useCallback(() => {
    setWizardForced(new URLSearchParams(window.location.search).get("setup") === "1");
    const d = getDesktop();
    if (d) {
      void d.settings.get().then((s) =>
        setInstallSettings({ onboardingCompletedAt: (s.onboardingCompletedAt as string | null) ?? null }),
      );
    } else {
      setInstallSettings({ onboardingCompletedAt: null });
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser + main-process state
    loadInstallState();
  }, [loadInstallState]);

  // The decision is latched: creating the first project mid-flow changes
  // projectCount, and an un-latched wizard would unmount at the project step.
  // A forced wizard (?setup=1) also has to stay open until it is finished —
  // shouldShowWizard() keeps returning true for as long as the URL says so.
  const wizardDecision =
    installSettings !== null &&
    shouldShowWizard({
      desktop: getDesktop() !== null,
      completedAt: installSettings.onboardingCompletedAt,
      projectCount: projectCount ?? 0,
      forced: wizardForced,
    });
  const [wizardOpen, setWizardOpen] = useState(false);
  if (wizardDecision && !wizardOpen) setWizardOpen(true); // render-time latch (adjust state during render)
  const closeWizard = (): void => {
    setWizardOpen(false);
    setWizardForced(false);
    setInstallSettings({ onboardingCompletedAt: new Date().toISOString() });
  };

  // First run, browser case (unchanged): no projects yet — prompt the user to
  // create one. Closing the dialog (backdrop/Escape) falls back to a default
  // project so the workspace always resolves to a real project. Re-appears
  // after "Reset all data". Never shown at the same time as the wizard.
  const firstRunOpen = !wizardOpen && projectCount === 0;

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

  // Background reindex of the local semantic index (runs in a worker, never
  // blocks the UI).
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

  // P10.T9: follow the main-process updater's live phase (no-op in a browser).
  useEffect(() => useUpdatesStore.getState().bindUpdater(), []);

  // Hydration-safe: server + first client render put the sidebar on the
  // left; the "right" direction moves it after mount.
  const sidebarOnLeft = !mounted || taskbarDirection !== "right";

  return (
    <DbGate>
      <div className="flex h-screen overflow-hidden" data-testid="app-shell">
        <SecretsBootstrap />
        <AutoBackup />
        {sidebarOnLeft && <Sidebar />}
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
            <div className="relative z-10 h-full">
              {dockEnabled ? (
                <Suspense fallback={null}>
                  <DockWorkspaceLive />
                </Suspense>
              ) : (
                children
              )}
            </div>
          </main>
        </div>
        {!sidebarOnLeft && <Sidebar />}
        <CommandPalette />
        <QuickSwitcher />
        <Toaster />
        <GlobalSearch />
        <ShortcutsDialog />
        {wizardOpen ? <SetupWizard onDone={closeWizard} /> : null}
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
    </DbGate>
  );
}
