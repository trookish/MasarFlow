"use client";

import { createElement, useEffect, useRef } from "react";
import { ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import { useDockStore } from "@/lib/stores/dock";
import { useUIStore } from "@/lib/stores/ui";
import { focusedPanelId } from "@/lib/dock/dock-core";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";
import { useDockSync } from "@/lib/hooks/use-dock-sync";
import { useTerminalSync } from "@/lib/hooks/use-terminal-sync";
import { showPanel, useIsMounted } from "@/lib/dock/mount-cap";
import { adjacentTabId, workspaceTabIds } from "@/lib/navigation/workspace-tabs";
import { PanelErrorBoundary, PanelMissing } from "@/components/dock/panel-error";
import { panelComponent } from "@/components/dock/panel-loader";
import { SurfaceView } from "@/components/shell/surface-view";
import { SURFACES } from "@/lib/navigation/surfaces";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

function WorkspacePanel({ panelId, active, index }: { panelId: string; active: boolean; index: number }) {
  const mounted = useIsMounted(panelId);
  useEffect(() => (active ? showPanel(panelId) : undefined), [active, panelId]);
  if (!mounted) return null;

  const surface = SURFACES.find((item) => item.route === pageIdOf(panelId));
  const Page = surface ? null : panelComponent(panelId);

  return (
    <div
      id={`workspace-panel-${index}`}
      role="tabpanel"
      aria-labelledby={`workspace-tab-${index}`}
      aria-hidden={!active}
      data-testid={active ? "dock-panel" : undefined}
      data-dock-url={panelId}
      className="h-full min-h-0"
    >
      <div className={cn("h-full min-h-0", !active && "hidden")} aria-hidden={!active}>
        <PanelErrorBoundary panelId={panelId}>
          {surface ? <SurfaceView id={surface.id} /> : Page ? createElement(Page) : <PanelMissing panelId={panelId} />}
        </PanelErrorBoundary>
      </div>
    </div>
  );
}

/** One project, one linear set of tabs. Legacy split layouts are migrated by the store. */
export function WorkspaceTabs() {
  useDockSync();
  useTerminalSync();
  const projectState = useDockStore((s) => (s.activeProjectId ? s.projects[s.activeProjectId] : null));
  const focus = useDockStore((s) => s.focus);
  const close = useDockStore((s) => s.close);
  const undo = useDockStore((s) => s.reopenClosedTab);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const tabs = projectState ? workspaceTabIds(projectState) : [];
  const focused = projectState ? focusedPanelId(projectState) : null;
  const activeTab = focused && tabs.includes(focused) ? focused : tabs[0];

  function focusAndScroll(panelId: string) {
    focus(panelId);
    requestAnimationFrame(() => {
      const tab = tabRefs.current.get(panelId);
      tab?.focus();
      tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  return (
    <div
      data-testid="shell-ready"
      data-dock-workspace
      data-layout="tabs"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div className="flex h-11 shrink-0 items-stretch border-b border-border bg-card/60 pl-2">
        <div role="tablist" aria-label="Project tabs" className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((panelId, index) => {
            const def = getPageDef(panelId);
            const Icon = def?.icon;
            const active = panelId === activeTab;
            const label = def?.label ?? pageIdOf(panelId);
            return (
              <div
                key={panelId}
                className={cn(
                  "group relative flex h-9 min-w-32 max-w-52 shrink-0 items-center rounded-t-md border border-b-0 transition-colors",
                  active
                    ? "border-border bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <button
                  ref={(node) => {
                    if (node) tabRefs.current.set(panelId, node);
                    else tabRefs.current.delete(panelId);
                  }}
                  id={`workspace-tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`workspace-panel-${index}`}
                  tabIndex={active ? 0 : -1}
                  data-dock-tab
                  data-dock-url={panelId}
                  onClick={() => focus(panelId)}
                  onAuxClick={(event) => {
                    if (event.button === 1) close(panelId);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
                    event.preventDefault();
                    const next = event.key === "Home"
                      ? tabs[0]
                      : event.key === "End"
                        ? tabs[tabs.length - 1]
                        : adjacentTabId(tabs, panelId, event.key === "ArrowRight" ? 1 : -1);
                    if (next) focusAndScroll(next);
                  }}
                  className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  title={label}
                >
                  {Icon ? <Icon className={cn("h-3.5 w-3.5 shrink-0", active && "text-primary")} /> : null}
                  <span className="truncate">{label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${label} tab`}
                  title={`Close ${label}`}
                  onClick={() => close(panelId)}
                  className={cn(
                    "mr-1.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !active && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 border-l border-border/70 px-1.5">
          <button
            type="button"
            aria-label="Open a tab"
            title="Open a tab (Ctrl+K)"
            onClick={() => setPaletteOpen(true)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                type="button"
                aria-label={`All project tabs (${tabs.length})`}
                title="All project tabs"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Project tabs</DropdownMenuLabel>
              {tabs.map((panelId) => {
                const def = getPageDef(panelId);
                const Icon = def?.icon;
                return (
                  <DropdownMenuItem key={panelId} active={panelId === activeTab} onSelect={() => focus(panelId)}>
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    <span className="truncate">{def?.label ?? pageIdOf(panelId)}</span>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={undo}>
                <RotateCcw className="h-4 w-4" />
                Reopen closed tab
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs.map((panelId, index) => (
          <WorkspacePanel key={panelId} panelId={panelId} active={panelId === activeTab} index={index} />
        ))}
      </div>
    </div>
  );
}
