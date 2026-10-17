"use client";

/**
 * Topbar workspace switcher for the dock: switch between saved workspaces,
 * duplicate or delete one, save the current layout under a new name, copy and
 * paste a layout as JSON, reset to the preset, and undo the last destructive
 * change.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutPanelTop,
  Check,
  ClipboardPaste,
  Copy,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useDockStore } from "@/lib/stores/dock";
import { undoDepth as undoDepthOf } from "@/lib/dock/undo";
import { pushToast } from "@/lib/stores/toast";
import { WORKSPACE_PRESETS } from "@/lib/dock/presets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** "Planning copy", then "Planning copy 2", … — never an existing name. */
function nextFreeName(state: { workspaces: Record<string, unknown> }, base: string): string {
  if (!state.workspaces[base]) return base;
  let n = 2;
  while (state.workspaces[`${base} ${n}`]) n += 1;
  return `${base} ${n}`;
}

export function WorkspaceMenu() {
  const projectState = useDockStore((s) =>
    s.activeProjectId ? (s.projects[s.activeProjectId] ?? null) : null,
  );
  const setWorkspace = useDockStore((s) => s.setWorkspace);
  const saveWorkspaceAs = useDockStore((s) => s.saveWorkspaceAs);
  const resetWorkspace = useDockStore((s) => s.resetWorkspace);
  const deleteWorkspace = useDockStore((s) => s.deleteWorkspace);
  const exportLayout = useDockStore((s) => s.exportLayout);
  const importLayout = useDockStore((s) => s.importLayout);
  const undo = useDockStore((s) => s.undo);
  const activeProjectId = useDockStore((s) => s.activeProjectId);
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

  // Undo depth lives in the pure history module; re-deriving it per render is
  // cheap and keeps the menu honest about what can actually be undone.
  const undoDepth = activeProjectId ? undoDepthOf(activeProjectId) : 0;

  async function copyLayout(): Promise<void> {
    const json = exportLayout();
    if (!json) return;
    await navigator.clipboard.writeText(json);
    pushToast({
      title: "Layout copied",
      description: "Paste it into another project or keep it as a backup.",
      tone: "success",
    });
  }

  async function pasteLayout(): Promise<void> {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      pushToast({
        title: "Clipboard is not available",
        description: "Allow clipboard access, or paste the JSON into a note instead.",
        tone: "danger",
      });
      return;
    }
    const installed = importLayout(text);
    if (!installed) {
      pushToast({
        title: "That is not a MasarFlow layout file",
        description: "Copy one first with “Copy layout to clipboard”.",
        tone: "danger",
      });
    }
  }

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
            {name_ !== projectState.activeWorkspace ? (
              <span
                role="button"
                aria-label={`Duplicate workspace ${name_}`}
                title={`Duplicate ${name_}`}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.stopPropagation();
                  useDockStore.getState().saveWorkspaceAs(nextFreeName(projectState, `${name_} copy`));
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  useDockStore.getState().saveWorkspaceAs(nextFreeName(projectState, `${name_} copy`));
                }}
                className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
              </span>
            ) : null}
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copyLayout()}>
          <Copy className="h-4 w-4" /> Copy layout to clipboard
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void pasteLayout()}>
          <ClipboardPaste className="h-4 w-4" /> Paste layout from clipboard
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={workspaces.length <= 1}
          onSelect={() => deleteWorkspace(projectState.activeWorkspace)}
        >
          <Trash2 className="h-4 w-4" /> Delete this workspace
        </DropdownMenuItem>
        {undoDepth > 0 ? (
          <DropdownMenuItem onSelect={undo}>
            <Undo2 className="h-4 w-4" /> Undo last layout change
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
