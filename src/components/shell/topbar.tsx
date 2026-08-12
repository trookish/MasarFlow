"use client";

import { useState } from "react";
import { Search, Command as CommandIcon, Keyboard, PanelLeft, RefreshCw } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui";
import { ProjectSwitcher } from "./project-switcher";
import { ThemeToggle } from "./theme-toggle";
import { PomodoroWidget, DailyNoteButton } from "./plugin-widgets";
import { UpdateDialog } from "./update-dialog";
import { useUpdatesStore } from "@/lib/stores/updates";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

export function Topbar() {
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const setShortcutsOpen = useUIStore((s) => s.setShortcutsOpen);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const [updateOpen, setUpdateOpen] = useState(false);
  const updateInfo = useUpdatesStore((s) => s.info);
  const updateState = useUpdatesStore((s) => s.state);
  const checkUpdates = useUpdatesStore((s) => s.check);

  async function openUpdates() {
    setUpdateOpen(true);
    if (updateState !== "checking") void checkUpdates();
  }

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <Tooltip label={sidebarCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"} side="bottom" align="start">
        <Button
          variant="ghost"
          size="icon"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </Tooltip>

      <ProjectSwitcher />

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="group flex h-9 max-w-md flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-accent"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search everything…</span>
        <Kbd>⌘/</Kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <PomodoroWidget />
        <DailyNoteButton />
        <Tooltip label="Check for updates" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Check for updates"
            onClick={() => void openUpdates()}
            className="relative"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                updateState === "checking" && "animate-spin",
              )}
            />
            {updateInfo?.updateAvailable ? (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
            ) : null}
          </Button>
        </Tooltip>
        <Tooltip label="Command palette (⌘K)" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Command palette"
            onClick={() => setPaletteOpen(true)}
          >
            <CommandIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
        <Tooltip label="Keyboard shortcuts (?)" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            <Keyboard className="h-4 w-4" />
          </Button>
        </Tooltip>
        <ThemeToggle />
      </div>
      <UpdateDialog open={updateOpen} onOpenChange={setUpdateOpen} />
    </header>
  );
}