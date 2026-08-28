"use client";

/**
 * Dock group header: the tab strip for a tabs node (or the single tab of a
 * page node), with close buttons and the group action menu (float, maximize,
 * collapse, close). Tabs start drags via the DnD controller.
 */

import { X, MoreHorizontal, PictureInPicture2, Maximize2, PanelBottomClose, PanelLeftClose } from "lucide-react";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";
import { useDockStore } from "@/lib/stores/dock";
import { startPanelDrag } from "./use-dock-dnd";
import { PanelContent } from "./panel-content";
import { PAGE_COMPONENTS } from "./panel-loader";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

export interface DockGroupProps {
  nodeId: string;
  pages: string[];
  activePage: string;
  collapsed: boolean;
}

export function DockGroup({ nodeId, pages, activePage, collapsed }: DockGroupProps) {
  const focus = useDockStore((s) => s.focus);
  const close = useDockStore((s) => s.close);
  const toggleCollapse = useDockStore((s) => s.toggleCollapse);
  const toggleMaximize = useDockStore((s) => s.toggleMaximize);

  function startTabDrag(e: React.PointerEvent, panelId: string) {
    if (e.button !== 0) return;
    startPanelDrag(panelId, nodeId, e);
  }

  if (collapsed) {
    // Collapsed slot: a slim bar with a restore button.
    const def = getPageDef(activePage);
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center bg-sidebar/40">
        <Tooltip label={`Restore ${def?.label ?? activePage}`} side="bottom">
          <button
            type="button"
            aria-label={`Restore ${def?.label ?? activePage}`}
            onClick={() => toggleCollapse(pageIdOf(activePage))}
            className="mt-2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <PanelBottomClose className="h-4 w-4 -rotate-90" />
          </button>
        </Tooltip>
        <span className="mt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl]">
          {def?.label ?? pageIdOf(activePage)}
        </span>
      </div>
    );
  }

  return (
    <div
      data-dock-node={nodeId}
      className="flex h-full min-h-0 w-full flex-col"
    >
      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Dock panel tabs"
        className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border bg-sidebar/40 px-1.5"
        onPointerDown={(e) => {
          // Dragging the empty strip area moves the whole group.
          if (e.target === e.currentTarget) startTabDrag(e, activePage);
        }}
      >
        {pages.map((panelId) => {
          const def = getPageDef(panelId);
          const Icon = def?.icon;
          const active = panelId === activePage;
          return (
            <div
              key={panelId}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                startTabDrag(e, panelId);
                if (!active) focus(panelId);
              }}
              className={cn(
                "group/tab flex h-7 max-w-44 cursor-grab items-center gap-1.5 rounded-md px-2 text-xs transition-colors select-none",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
              <span className="truncate">{def?.label ?? pageIdOf(panelId)}</span>
              <button
                type="button"
                aria-label={`Close ${def?.label ?? panelId}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  close(panelId);
                }}
                className="ml-0.5 hidden h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-background group-hover/tab:flex"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {/* Group actions */}
        <div className="ml-auto flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger className="cursor-pointer">
              <span
                aria-label="Panel actions"
                role="button"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  useDockStore.getState().float(activePage, { x: 120, y: 90 })
                }
              >
                <PictureInPicture2 className="h-3.5 w-3.5" /> Float panel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toggleMaximize(activePage)}>
                <Maximize2 className="h-3.5 w-3.5" /> Maximize / restore
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toggleCollapse(activePage)}>
                <PanelLeftClose className="h-3.5 w-3.5" /> Collapse
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Active panel content; inactive tabs stay mounted but hidden. */}
      <div className="min-h-0 flex-1">
        {pages.map((panelId) => (
          <PanelTab key={panelId} panelId={panelId} active={panelId === activePage} />
        ))}
      </div>
    </div>
  );
}

function PanelTab({ panelId, active }: { panelId: string; active: boolean }) {
  const Component = PAGE_COMPONENTS[pageIdOf(panelId)] ?? null;
  return (
    <PanelContent active={active}>
      {Component ? (
        <Component />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Page not found: {pageIdOf(panelId)}
        </div>
      )}
    </PanelContent>
  );
}
