"use client";

/**
 * The dock workspace — the docked-mode replacement for `{children}` in the
 * workspace layout. Interim v1: renders the FOCUSED panel over the full
 * area. The recursive tree renderer (splits, tab groups, floaters) replaces
 * this in the next milestone; the sync/persistence layer is already live.
 */

import { useProjectStore } from "@/lib/stores/project";
import { useDockStore } from "@/lib/stores/dock";
import { focusedPanelId } from "@/lib/dock/dock-core";
import { pageIdOf } from "@/lib/dock/types";
import { PAGE_COMPONENTS } from "./panel-loader";

export function DockWorkspace() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projectState = useDockStore((s) =>
    s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null,
  );

  if (!activeProjectId || !projectState) {
    return <div className="h-full w-full bg-background" />;
  }

  const focused = focusedPanelId(projectState);
  // Member access, not a factory call: the react-compiler lint rule forbids
  // creating components during render.
  const Component = PAGE_COMPONENTS[pageIdOf(focused)] ?? null;

  return (
    <div className="h-full w-full overflow-hidden">
      {Component ? (
        <Component />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Page not found: {focused}
        </div>
      )}
    </div>
  );
}
