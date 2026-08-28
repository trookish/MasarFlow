"use client";

/**
 * The dock workspace — the docked-mode replacement for `{children}` in the
 * workspace layout. Renders the active workspace's layout tree recursively,
 * with maximize handling. Floating windows land with the DnD milestone.
 */

import type { DockNode } from "@/lib/dock/types";
import { pageIdOf } from "@/lib/dock/types";
import { useProjectStore } from "@/lib/stores/project";
import { useDockStore } from "@/lib/stores/dock";
import { PAGE_COMPONENTS } from "./panel-loader";
import { DockTreeView } from "./dock-tree-view";
import { PanelContent } from "./panel-content";

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
      {/* Tree, hidden while a panel is maximized (panels stay mounted). */}
      <PanelContent active={!maximized}>
        <DockTreeView node={tree} />
      </PanelContent>

      {/* Maximized panel fills the workspace above the tree. */}
      {maximized ? (
        <div className="absolute inset-0 z-20">
          <MaximizedPanel panelId={maximized} />
        </div>
      ) : null}
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
