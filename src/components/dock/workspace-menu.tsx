"use client";

/**
 * Topbar workspace switcher for the dock: switch between saved workspaces,
 * save the current layout under a new name, reset to the preset, and create
 * an empty new workspace.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutPanelTop, Check, Plus, RotateCcw, Save } from "lucide-react";
import { useDockStore } from "@/lib/stores/dock";
import { WORKSPACE_PRESETS } from "@/lib/dock/presets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceMenu() {
  const projectState = useDockStore((s) =>
    s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null,
  );
  const setWorkspace = useDockStore((s) => s.setWorkspace);
  const saveWorkspaceAs = useDockStore((s) => s.saveWorkspaceAs);
  const resetWorkspace = useDockStore((s) => s.resetWorkspace);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  const workspaces = useMemo(
    () => (projectState ? Object.keys(projectState.workspaces) : []),
    [projectState],
  );

  function submitName() {
    if (!projectState) return;
    const trimmed = name.trim();
    if (trimmed) {
      if (projectState.workspaces[trimmed]) {
        setWorkspace(trimmed);
      } else {
        saveWorkspaceAs(trimmed);
      }
    }
    setNaming(false);
    setName("");
  }

  if (!projectState) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer">
        <span
          role="button"
          aria-label="Workspaces"
          title="Workspaces"
          className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LayoutPanelTop className="h-4 w-4" />
          <span className="hidden max-w-28 truncate md:inline">
            {projectState.activeWorkspace}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((name_) => (
          <DropdownMenuItem
            key={name_}
            active={name_ === projectState.activeWorkspace}
            onSelect={() => setWorkspace(name_)}
          >
            <Check
              className={
                name_ === projectState.activeWorkspace
                  ? "h-4 w-4"
                  : "h-4 w-4 opacity-0"
              }
            />
            {name_}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setNaming(true)}>
          <Save className="h-4 w-4" /> Save current layout as…
        </DropdownMenuItem>
        {naming ? (
          <div className="px-2 pb-1">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitName();
                if (e.key === "Escape") {
                  setNaming(false);
                  setName("");
                }
              }}
              placeholder="Workspace name"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        ) : null}
        <DropdownMenuItem
          onSelect={() => {
            // New workspace: clone current layout under an unused name.
            let i = projectState.workspaces
              ? Object.keys(projectState.workspaces).filter((w) =>
                  w.startsWith("Workspace "),
                ).length
              : 0;
            let candidate = `Workspace ${i + 1}`;
            while (projectState.workspaces[candidate]) {
              i += 1;
              candidate = `Workspace ${i + 1}`;
            }
            saveWorkspaceAs(candidate);
          }}
        >
          <Plus className="h-4 w-4" /> New workspace (copy current)
        </DropdownMenuItem>
        {WORKSPACE_PRESETS[projectState.activeWorkspace] ? (
          <DropdownMenuItem onSelect={resetWorkspace}>
            <RotateCcw className="h-4 w-4" /> Reset to preset
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
