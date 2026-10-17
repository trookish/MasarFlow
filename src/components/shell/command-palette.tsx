"use client";

/**
 * Command palette v2 — the single door into the app.
 *
 * What it searches (all provided by existing modules, never re-implemented):
 *   Commands  src/lib/commands/registry.ts (pure; this file injects the actions)
 *   Entities  buildSearchItems + createSearchIndex (the same index GlobalSearch uses, P5 hrefs)
 *   Recent    src/lib/stores/recent.ts (per-project lanes)
 *
 * Interaction rules: mode chips instead of magic prefixes (nothing cryptic),
 * destructive commands always route through ConfirmDialog, cmdk owns the ARIA
 * combobox/listbox semantics, the shared Dialog owns Escape, and
 * useFocusTrap supplies the focus containment that Dialog lacks.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Clock, ListChecks, Search } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/lib/stores/ui";
import { useProjectStore } from "@/lib/stores/project";
import { useDockStore } from "@/lib/stores/dock";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { useFocusTrap } from "@/lib/hooks/use-focus-trap";
import { useRecentStore } from "@/lib/stores/recent";
import { buildCommands, type Command as Cmd, type CommandActions } from "@/lib/commands/registry";
import { filterCommands, type CommandMode } from "@/lib/commands/filter";
import { getDesktop } from "@/lib/desktop/bridge";
import { projectsRepo, notesRepo, tasksRepo } from "@/lib/db/repos";
import { resetData } from "@/lib/db/data";
import { buildSearchItems, createSearchIndex, kindLabel, type SearchItem } from "@/lib/utils/search";
import { focusedPanelId } from "@/lib/dock/dock-core";
import { pageIdOf } from "@/lib/dock/types";
import { openDailyNote } from "@/lib/vault/daily";
import { pushToast } from "@/lib/stores/toast";

const MODES: { id: CommandMode; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "go", label: "Go to" },
  { id: "dock", label: "Dock" },
];

export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const trapRef = useRef<HTMLDivElement>(null);
  useFocusTrap(trapRef, open);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      position="top"
      showClose={false}
      className="overflow-hidden p-0"
      ariaLabel="Command palette"
    >
      <div ref={trapRef}>
        {open ? <PalettePanel onClose={() => setOpen(false)} /> : null}
      </div>
    </Dialog>
  );
}

function PalettePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const projectId = useActiveProjectId();
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);
  const dockEnabled = useUIStore((s) => s.dockEnabled);
  const setDockEnabled = useUIStore((s) => s.setDockEnabled);
  const desktop = useMemo(() => getDesktop(), []);
  const { theme, setTheme } = useTheme();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<CommandMode>("all");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [pending, setPending] = useState<Cmd | null>(null);

  const recents = useRecentStore((s) => (projectId ? s.byProject[projectId] ?? [] : []));

  useEffect(() => {
    void projectsRepo.all().then((rows) => setProjects(rows.map((p) => ({ id: p.id, name: p.name }))));
  }, []);

  useEffect(() => {
    let active = true;
    void buildSearchItems(projectId ?? undefined).then((result) => {
      if (active) setItems(result);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  function go(href: string): void {
    onClose();
    router.push(href);
  }

  function openPanel(panelId: string): void {
    onClose();
    useDockStore.getState().open(panelId);
  }

  const actions: CommandActions = {
    navigate: go,
    openPanel,
    closeFocusedPanel: () => {
      const dock = useDockStore.getState();
      const state = dock.activeProjectId ? dock.projects[dock.activeProjectId] : null;
      if (state) dock.close(focusedPanelId(state));
    },
    floatFocusedPanel: () => {
      const dock = useDockStore.getState();
      const state = dock.activeProjectId ? dock.projects[dock.activeProjectId] : null;
      if (state) dock.float(focusedPanelId(state), { x: 160, y: 120 });
    },
    toggleMaximizeFocused: () => {
      const dock = useDockStore.getState();
      const state = dock.activeProjectId ? dock.projects[dock.activeProjectId] : null;
      if (state) dock.toggleMaximize(pageIdOf(focusedPanelId(state)));
    },
    resetWorkspace: () => useDockStore.getState().resetWorkspace(),
    copyLayout: () => {
      const json = useDockStore.getState().exportLayout();
      if (!json) return;
      void navigator.clipboard.writeText(json);
      pushToast({ title: "Layout copied", tone: "success" });
    },
    pasteLayout: () => {
      void navigator.clipboard.readText().then((text) => {
        const installed = useDockStore.getState().importLayout(text);
        if (!installed) {
          pushToast({ title: "That is not a MasarFlow layout file", tone: "danger" });
        }
      });
    },
    toggleTheme: () => setTheme(theme === "light" ? "dark" : "light"),
    switchProject: (id) => {
      setActiveProjectId(id);
      const project = projects.find((p) => p.id === id);
      pushToast({ title: `Switched to ${project?.name ?? "project"}` });
    },
    newTask: () => {
      if (!projectId) return;
      void tasksRepo.create({ projectId, title: "Untitled task" }).then(() => go("/tasks"));
    },
    newNote: () => {
      if (!projectId) return;
      void notesRepo
        .create({ projectId, title: "Untitled note" })
        .then((note) => go(`/brain?note=${note.id}`));
    },
    openDailyNote: () => {
      if (!projectId) return;
      void openDailyNote(projectId).then(() => onClose());
    },
    openLogsFolder: () => void desktop?.app.openLogs(),
    resetAllData: () => {
      void resetData().then(() => {
        setActiveProjectId(null);
        go("/dashboard");
      });
    },
    isEntityOpen: () => false,
  };

  const commands = useMemo(
    () =>
      buildCommands(
        {
          dockEnabled,
          hasProject: Boolean(projectId),
          projectId,
          theme: theme === "light" ? "light" : "dark",
          projects,
          desktopAvailable: Boolean(desktop),
        },
        actions,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dockEnabled, projectId, projects, theme, desktop, items.length],
  );

  const visibleCommands = useMemo(() => filterCommands(commands, query, mode), [commands, query, mode]);

  const fuse = useMemo(() => createSearchIndex(items), [items]);
  const entityHits = useMemo(() => {
    if (query.trim().length < 2 || mode === "dock") return [];
    return fuse
      .search(query)
      .slice(0, 12)
      .map((hit) => hit.item);
  }, [fuse, query, mode]);

  const results = entityHits.slice(0, 6);

  function runCommand(command: Cmd): void {
    if (command.confirm) {
      setPending(command);
      return;
    }
    onClose();
    void command.run();
  }

  return (
    <>
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Type a command, a page, a task, a note…"
          aria-label="Search commands, pages and items"
          autoFocus
        />

        {/* Mode chips: discoverable modes beat magic prefixes. */}
        <div role="group" aria-label="What to search" className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={mode === entry.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode(entry.id)}
              className={
                mode === entry.id
                  ? "rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-foreground"
                  : "rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50"
              }
            >
              {entry.label}
            </button>
          ))}
          <span className="ml-auto pr-1 text-[11px] text-muted-foreground">
            {projectId ? "Searches this project" : "No project open"}
          </span>
        </div>

        <CommandList>
          <CommandEmpty>
            {items.length === 0
              ? "Nothing to search yet — create a note, a task or a specification."
              : `No match for “${query}”. Try fewer words, or another chip above.`}
          </CommandEmpty>

          {query.trim().length === 0 && recents.length > 0 ? (
            <CommandGroup heading="Recent">
              {recents.slice(0, 5).map((recent) => (
                <CommandItem
                  key={`recent-${recent.kind}-${recent.id}`}
                  value={`recent-${recent.kind}-${recent.id}`}
                  onSelect={() => go(recent.href)}
                >
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{recent.label}</span>
                  <span className="text-[11px] text-muted-foreground">Recent</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {results.length > 0 ? (
            <CommandGroup heading="Items">
              {results.map((item) => (
                <CommandItem key={`entity-${item.id}`} value={`entity-${item.id}`} onSelect={() => go(item.href)}>
                  <Badge variant="outline" className="shrink-0">
                    {kindLabel(item.kind)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.subtitle ? (
                    <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {visibleCommands.length > 0 ? (
            <CommandGroup heading={mode === "all" ? "Commands" : MODES.find((m) => m.id === mode)?.label ?? "Commands"}>
              {visibleCommands.map((command) => (
                <CommandItem
                  key={command.id}
                  value={command.id}
                  onSelect={() => runCommand(command)}
                  className={command.tone === "danger" ? "text-destructive" : undefined}
                >
                  <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint ? <span className="text-[11px] text-muted-foreground">{command.hint}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>

      {/* Dock toggle + a first-run hint live outside the list so they are always reachable. */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Search className="h-3 w-3" /> Type to filter · chips narrow it down · Esc closes
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDockEnabled(!dockEnabled)}
          className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
        >
          {dockEnabled ? "Dock: on — click to use full pages" : "Dock: off — click to use panels"}
        </button>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null);
        }}
        title={pending?.confirm?.title ?? ""}
        description={pending?.confirm?.body ?? ""}
        confirmLabel={pending?.confirm?.confirmLabel ?? "Confirm"}
        destructive
        onConfirm={() => {
          const command = pending;
          setPending(null);
          onClose();
          void command?.run();
        }}
      />
    </>
  );
}
