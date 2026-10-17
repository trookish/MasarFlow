"use client";

/**
 * "All tabs (N)" menu: the always-visible list of every panel in a crowded
 * group, with a close button per row. Rendered only when a group passes
 * TAB_MENU_THRESHOLD, next to the group action menu.
 */

import { X } from "lucide-react";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";
import { useDockStore } from "@/lib/stores/dock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

export function TabMenu({
  pages,
  activePage,
}: {
  pages: string[];
  activePage: string;
}) {
  const focus = useDockStore((s) => s.focus);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer">
        <span
          role="button"
          aria-label={`All tabs in this group (${pages.length})`}
          title={`All tabs (${pages.length})`}
          className="flex h-6 items-center rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          All tabs ({pages.length})
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Panels in this group</DropdownMenuLabel>
        {pages.map((panelId) => {
          const def = getPageDef(panelId);
          const Icon = def?.icon;
          const active = panelId === activePage;
          return (
            <DropdownMenuItem
              key={panelId}
              active={active}
              onSelect={() => focus(panelId)}
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              <span className={cn("truncate", active && "font-medium")}>
                {def?.label ?? pageIdOf(panelId)}
              </span>
              <X
                aria-label={`Close ${def?.label ?? panelId}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    useDockStore.getState().close(panelId);
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  useDockStore.getState().close(panelId);
                }}
                className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-destructive"
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
