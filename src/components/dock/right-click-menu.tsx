"use client";

/**
 * Tab context menu — the discoverable path to the rest of the dock's verbs.
 *
 * The tab itself already carries drag, close and keyboard focus. Everything the
 * dock can otherwise do to a panel (float it, split it out, maximize, collapse
 * the group, close the others) lived only in a hidden gesture or not at all;
 * a right-click is where a Windows user looks for it.
 *
 * Every item calls exactly one existing store action — the menu owns no state
 * beyond "am I open", and it invents no new dock capability.
 */

import type { ReactNode } from "react";
import {
  AppWindow,
  Columns2,
  Maximize2,
  PanelBottomClose,
  Rows2,
  Trash2,
  X,
} from "lucide-react";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";
import { useDockStore } from "@/lib/stores/dock";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  useDropdown,
} from "@/components/ui/dropdown-menu";

export interface TabActionsMenuProps {
  panelId: string;
  /** The group's node id — the target the split items move the panel beside. */
  groupNodeId: string;
  /** Every page in the group, for "Close the other panels". */
  pages: string[];
  children: ReactNode;
}

/**
 * Opens the menu on right-click only.
 *
 * `DropdownMenuTrigger` toggles on click, which would fire on every tab click,
 * and `DropdownMenu` has no `open` prop — so this uses the trigger hook the UI
 * kit exports (`useDropdown`). Chromium dispatches `contextmenu` for Shift+F10
 * and the menu key on a focused element, so the menu is keyboard-reachable too.
 * On a touch/pen device, long-press does NOT fire it: the same items are also
 * reachable from the keyboard shortcuts in the shortcuts dialog.
 */
function ContextArea({ children }: { children: ReactNode }) {
  const { setOpen } = useDropdown();
  return (
    <div
      className="contents"
      onContextMenu={(event) => {
        event.preventDefault();
        setOpen(true);
      }}
    >
      {children}
    </div>
  );
}

/** Floating windows cascade so two of them never land exactly on top of each other. */
const FLOAT_ORIGIN = { x: 160, y: 120 };
const FLOAT_CASCADE = 24;

export function TabActionsMenu({ panelId, groupNodeId, pages, children }: TabActionsMenuProps) {
  const label = getPageDef(panelId)?.label ?? pageIdOf(panelId);
  const others = pages.filter((page) => page !== panelId);

  return (
    <DropdownMenu>
      <ContextArea>{children}</ContextArea>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            const dock = useDockStore.getState();
            const index = dock.getProject()?.floaters.length ?? 0;
            dock.float(panelId, {
              x: FLOAT_ORIGIN.x + index * FLOAT_CASCADE,
              y: FLOAT_ORIGIN.y + index * FLOAT_CASCADE,
            });
          }}
        >
          <AppWindow className="h-4 w-4" /> Float as a window
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => useDockStore.getState().move(panelId, groupNodeId, "right")}
        >
          <Columns2 className="h-4 w-4" /> Split right
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => useDockStore.getState().move(panelId, groupNodeId, "bottom")}
        >
          <Rows2 className="h-4 w-4" /> Split down
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => useDockStore.getState().toggleMaximize(panelId)}>
          <Maximize2 className="h-4 w-4" /> Maximize or restore
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => useDockStore.getState().toggleCollapse(panelId)}>
          <PanelBottomClose className="h-4 w-4" /> Collapse to the taskbar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => useDockStore.getState().close(panelId)}>
          <X className="h-4 w-4" /> Close
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => {
            const dock = useDockStore.getState();
            for (const page of others) dock.close(page);
          }}
        >
          <Trash2 className="h-4 w-4" /> Close the other {others.length} panels
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
