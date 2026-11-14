"use client";

/**
 * Zustand store for the project tab strip — persistence + action wrappers
 * around the pure reducers in @/lib/dock/* and @/lib/navigation/workspace-tabs.
 *
 * - projects: per-project tab state, persisted under "masarflow-dock-v1".
 *   Every state is normalized to one linear tab group on load and on
 *   project switch (see normalizeWorkspaceTabs).
 * - closedTabs: recently closed tab URLs per project, for Ctrl+Shift+T.
 * - pinnedTabs: page ids pinned per project. Pinned tabs sit at the front of the strip (the tree
 *   order is moved to match, so every index-based shortcut sees the same order) and refuse to close.
 * - In the browser, persistence uses localStorage; in non-DOM environments
 *   (tests, SSR utilities) it falls back to an in-memory storage.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  clampTabIndex,
  defaultWorkspaceTabsState,
  normalizeWorkspaceTabs,
  openPins,
  workspaceTabIds,
} from "@/lib/navigation/workspace-tabs";
import { parseProjectState } from "@/lib/dock/serde";
import type { ProjectDockState } from "@/lib/dock/types";
import { joinPanelId, pageIdOf, paramsOf } from "@/lib/dock/types";
import { resolveLegacyUrl } from "@/lib/navigation/redirects";
import { applyUrlFocus, closeEverywhere, focusedPanelId } from "@/lib/dock/dock-core";
import { collectPages, findHolder, focusPanel, reorderTab } from "@/lib/dock/tree";
import { getPageDef } from "@/lib/dock/registry";
import { pushToast } from "@/lib/stores/toast";

/** In-memory Storage shim for non-DOM environments (tests / SSR helpers). */
export const memoryStorage: Storage = (() => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
})();

interface DockStore {
  /** Persisted per-project tab states. */
  projects: Record<string, ProjectDockState>;
  /** Id of the project whose tabs are live (mirrors useProjectStore). */
  activeProjectId: string | null;
  /** Recently closed tabs per project, oldest first. */
  closedTabs: Record<string, string[]>;
  /** Pinned page ids per project. */
  pinnedTabs: Record<string, string[]>;

  getProject: () => ProjectDockState | null;
  setProject: (id: string | null) => void;

  /** Focus the tab for this URL, opening it when absent. Legacy URLs are canonicalized. */
  open: (panelId: string) => void;
  /** Close a tab; the last tab never closes. Records it for reopen. */
  close: (panelId: string) => void;
  reopenClosedTab: () => void;
  /**
   * The tab for `url`'s page was closed before its last navigation reached the dock (Ctrl+W in the
   * same tick as a section switch). Record that navigation on the closed entry, so Ctrl+Shift+T
   * reopens the section the user was looking at rather than the one before it.
   */
  amendLastClosed: (url: string) => void;
  focus: (panelId: string) => void;
  /** Move a tab to `index` within its strip (Alt+Shift+Left/Right). Pinned tabs keep the front. */
  reorder: (nodeId: string, panelId: string, index: number) => void;
  /** Pin or unpin a tab. Pinning moves it to the end of the pinned block; unpinning to just after it. */
  togglePin: (panelId: string) => void;
}

/** Pinned page ids of the active project that are still open, in strip order. */
export function activePins(s: Pick<DockStore, "activeProjectId" | "projects" | "pinnedTabs">): string[] {
  const id = s.activeProjectId;
  const state = id ? s.projects[id] : undefined;
  if (!id || !state) return [];
  return openPins(workspaceTabIds(state), s.pinnedTabs[id] ?? []);
}

/** Move one tab of the active workspace to `index`, leaving the focused tab focused. */
function moveTab(state: ProjectDockState, panelId: string, index: number): ProjectDockState {
  const wsEntry = state.workspaces[state.activeWorkspace];
  const holder = findHolder(wsEntry.tree, panelId);
  if (!holder || holder.type !== "tabs") return state;
  const focused = focusedPanelId(state);
  const moved = reorderTab(wsEntry.tree, holder.id, panelId, index);
  return {
    ...state,
    workspaces: {
      ...state.workspaces,
      [state.activeWorkspace]: { ...wsEntry, tree: focusPanel(moved, focused) },
    },
  };
}

/** Update the active project's state through a reducer (no-op when absent). */
function update(
  s: DockStore,
  fn: (state: ProjectDockState) => ProjectDockState,
): Partial<DockStore> {
  const id = s.activeProjectId;
  const current = id ? s.projects[id] : undefined;
  if (!id || !current) return {};
  return { projects: { ...s.projects, [id]: fn(current) } };
}

/** Display label for a panel id — never a raw path in user-facing copy. */
function panelLabel(panelId: string): string {
  return getPageDef(panelId)?.label ?? pageIdOf(panelId);
}

function canonicalize(panelId: string): string {
  return resolveLegacyUrl(pageIdOf(panelId), paramsOf(panelId)) ?? panelId;
}

export const useDockStore = create<DockStore>()(
  persist(
    (set, get) => ({
      projects: {},
      activeProjectId: null,
      closedTabs: {},
      pinnedTabs: {},

      getProject: (): ProjectDockState | null => {
        const s = get();
        return s.activeProjectId
          ? (s.projects[s.activeProjectId] ?? null)
          : null;
      },

      setProject: (id) =>
        set((s) => {
          if (!id) return { activeProjectId: null };
          const projects = { ...s.projects };
          if (projects[id]) projects[id] = normalizeWorkspaceTabs(projects[id]);
          else projects[id] = defaultWorkspaceTabsState();
          return { activeProjectId: id, projects };
        }),

      open: (panelId) =>
        set((s) => update(s, (state) => applyUrlFocus(state, canonicalize(panelId)))),

      close: (panelId) =>
        set((s) => {
          const id = s.activeProjectId;
          const before = id ? s.projects[id] : undefined;
          if (!id || !before) return {};
          const canonical = canonicalize(panelId);
          const path = pageIdOf(canonical);
          const openPages = collectPages(before.workspaces[before.activeWorkspace].tree);
          if (!openPages.includes(path) || openPages.length === 1) return {};
          if (activePins(s).includes(path)) {
            pushToast({
              title: `${panelLabel(path)} is pinned`,
              description: "Unpin the tab to close it.",
            });
            return {};
          }
          const next = update(s, (state) =>
            normalizeWorkspaceTabs(closeEverywhere(state, path)),
          );
          const closedUrl = joinPanelId(
            path,
            before.workspaces[before.activeWorkspace].params[path] ?? paramsOf(canonical),
          );
          pushToast({
            title: `Closed ${panelLabel(path)}`,
            description: "Reopen it with Ctrl+Shift+T.",
            actionLabel: "Reopen",
            onAction: () => useDockStore.getState().reopenClosedTab(),
          });
          return {
            ...next,
            closedTabs: {
              ...s.closedTabs,
              [id]: [...(s.closedTabs[id] ?? []), closedUrl].slice(-20),
            },
          };
        }),

      amendLastClosed: (url) =>
        set((s) => {
          const id = s.activeProjectId;
          const history = id ? (s.closedTabs[id] ?? []) : [];
          const last = history.at(-1);
          if (!id || !last || pageIdOf(last) !== pageIdOf(url) || last === url) return {};
          return { closedTabs: { ...s.closedTabs, [id]: [...history.slice(0, -1), url] } };
        }),

      reopenClosedTab: () =>
        set((s) => {
          const id = s.activeProjectId;
          const history = id ? (s.closedTabs[id] ?? []) : [];
          const panelId = history.at(-1);
          if (!id || !panelId) return {};
          return {
            ...update(s, (state) => applyUrlFocus(state, panelId)),
            closedTabs: { ...s.closedTabs, [id]: history.slice(0, -1) },
          };
        }),

      focus: (panelId) =>
        set((s) =>
          update(s, (state) => {
            const wsEntry = state.workspaces[state.activeWorkspace];
            const tree = focusPanel(wsEntry.tree, panelId);
            const holder = findHolder(tree, panelId);
            return {
              ...state,
              workspaces: {
                ...state.workspaces,
                [state.activeWorkspace]: { ...wsEntry, tree },
              },
              focusGroupId: holder ? holder.id : state.focusGroupId,
            };
          }),
        ),

      reorder: (nodeId, panelId, index) =>
        set((s) =>
          update(s, (state) => {
            const wsEntry = state.workspaces[state.activeWorkspace];
            const pins = activePins(s);
            const tabs = workspaceTabIds(state);
            const target = clampTabIndex(index, pins.includes(pageIdOf(panelId)), pins.length, tabs.length);
            return {
              ...state,
              workspaces: {
                ...state.workspaces,
                [state.activeWorkspace]: {
                  ...wsEntry,
                  tree: reorderTab(wsEntry.tree, nodeId, panelId, target),
                },
              },
            };
          }),
        ),

      togglePin: (panelId) =>
        set((s) => {
          const id = s.activeProjectId;
          const state = id ? s.projects[id] : undefined;
          if (!id || !state) return {};
          const tabs = workspaceTabIds(state);
          const tabId = tabs.find((t) => pageIdOf(t) === pageIdOf(panelId));
          if (!tabId) return {};
          const page = pageIdOf(tabId);
          const pins = activePins(s);
          const pinning = !pins.includes(page);
          const nextPins = pinning ? [...pins, page] : pins.filter((p) => p !== page);
          // Pinned block first: a pinned tab goes to its end, an unpinned one to just after it.
          const index = pinning ? pins.length : nextPins.length;
          return {
            projects: { ...s.projects, [id]: moveTab(state, tabId, index) },
            pinnedTabs: { ...s.pinnedTabs, [id]: nextPins },
          };
        }),
    }),
    {
      name: "masarflow-dock-v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : memoryStorage,
      ),
      partialize: (s) => ({
        projects: s.projects,
        activeProjectId: s.activeProjectId,
        closedTabs: s.closedTabs,
        pinnedTabs: s.pinnedTabs,
      }),
      // Untrusted persisted JSON: validate, never trust. Invalid payloads
      // (old versions, hand-edits) fall back to fresh defaults.
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Record<string, unknown>;
        const projects: Record<string, ProjectDockState> = {};
        const rawProjects = raw.projects;
        if (rawProjects && typeof rawProjects === "object") {
          for (const [id, value] of Object.entries(rawProjects)) {
            const parsed = parseProjectState(value);
            if (parsed) projects[id] = normalizeWorkspaceTabs(parsed);
          }
        }
        const activeProjectId =
          typeof raw.activeProjectId === "string" ? raw.activeProjectId : null;
        const closedTabs: Record<string, string[]> = {};
        if (raw.closedTabs && typeof raw.closedTabs === "object") {
          for (const [id, value] of Object.entries(raw.closedTabs)) {
            if (Array.isArray(value)) {
              closedTabs[id] = value.filter((entry): entry is string => typeof entry === "string").slice(-20);
            }
          }
        }
        const pinnedTabs: Record<string, string[]> = {};
        if (raw.pinnedTabs && typeof raw.pinnedTabs === "object") {
          for (const [id, value] of Object.entries(raw.pinnedTabs)) {
            if (Array.isArray(value)) {
              pinnedTabs[id] = value
                .filter((entry): entry is string => typeof entry === "string")
                .map((entry) => pageIdOf(canonicalize(entry)))
                .filter((entry, index, all) => all.indexOf(entry) === index);
            }
          }
        }
        return {
          ...current,
          closedTabs,
          pinnedTabs,
          projects:
            Object.keys(projects).length > 0
              ? projects
              : (current.projects ?? {}),
          activeProjectId,
        };
      },
    },
  ),
);
