"use client";

/**
 * Dock workspace: renders the active workspace's layout tree, floating
 * windows, the minimized/collapsed tray, and maximize handling.
 */

import type { DockNode } from "@/lib/dock/types";
import { pageIdOf } from "@/lib/dock/types";
import { useProjectStore } from "@/lib/stores/project";
import { useDockStore } from "@/lib/stores/dock";
import { PAGE_COMPONENTS } from "./panel-loader";
import { DockTreeView } from "./dock-tree-view";
import { PanelContent } from "./panel-content";
import { DockFloatingWindow } from "./dock-floating-window";
import { DockTray } from "./dock-tray";

export function DockWorkspace() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projectState = useDockStore((s) =>
    s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null,
  );

  if (!activeProjectId || !projectState) {
    return <div className="h-full w-full bg-background" />;
  }

  const wsEntry = projectState.workspaces[projectState.activeWorkspace];
  const tree: DockNode = wsEntry.tree;
  const maximized = projectState.maximizedPanelId;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Layout tree, hidden while a panel is maximized (stays mounted). */}
      <PanelContent active={!maximized}>
        <DockTreeView node={tree} />
      </PanelContent>

      {/* Maximized tiled panel fills the workspace above the tree. */}
      {maximized ? (
        <div className="absolute inset-0 z-20">
          <MaximizedPanel panelId={maximized} />
        </div>
      ) : null}

      {/* Floating windows. */}
      {projectState.floaters.map((f) =>
        f.minimized ? null : <DockFloatingWindow key={f.id} floater={f} />,
      )}

      {/* Minimized windows + collapsed panels. */}
      <DockTray />
    </div>
  );
}

function MaximizedPanel({ panelId }: { panelId: string }) {
  const Component = PAGE_COMPONENTS[pageIdOf(panelId)] ?? null;
  return Component ? (
    <Component />
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Page not found: {pageIdOf(panelId)}
    </div>
  );
}
