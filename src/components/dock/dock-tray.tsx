"use client";

/**
 * Bottom-right tray for minimized floaters and a restore point for collapsed
 * panels. Clicking an item restores it.
 */

import { PanelBottomClose, Square } from "lucide-react";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";
import { useDockStore } from "@/lib/stores/dock";

export function DockTray() {
  const projectState = useDockStore((s) =>
    s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null,
  );
  const toggleFloaterMinimized = useDockStore((s) => s.toggleFloaterMinimized);
  const focusFloater = useDockStore((s) => s.focusFloater);
  const toggleCollapse = useDockStore((s) => s.toggleCollapse);

  if (!projectState) return null;

  const minimized = projectState.floaters.filter((f) => f.minimized);
  const collapsed = projectState.collapsedPanels;

  if (minimized.length === 0 && collapsed.length === 0) return null;

  return (
    <div className="absolute bottom-3 right-3 z-50 flex items-center gap-1.5">
      {collapsed.map((panelId) => {
        const def = getPageDef(panelId);
        const Icon = def?.icon;
        return (
          <button
            key={panelId}
            type="button"
            aria-label={`Restore ${def?.label ?? panelId} panel`}
            onClick={() => toggleCollapse(panelId)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/90 px-2 text-xs text-muted-foreground shadow-md backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : <PanelBottomClose className="h-3.5 w-3.5" />}
            {def?.label ?? pageIdOf(panelId)}
          </button>
        );
      })}
      {minimized.map((f) => {
        const def = getPageDef(f.activePanel);
        const Icon = def?.icon;
        return (
          <button
            key={f.id}
            type="button"
            aria-label={`Restore ${def?.label ?? f.activePanel} window`}
            onClick={() => {
              toggleFloaterMinimized(f.id);
              focusFloater(f.id);
            }}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/90 px-2 text-xs text-muted-foreground shadow-md backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {def?.label ?? pageIdOf(f.activePanel)}
          </button>
        );
      })}
    </div>
  );
}
