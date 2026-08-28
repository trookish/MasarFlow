"use client";

/**
 * Zustand store for the dock window manager — persistence + action wrappers
 * around the pure reducers in @/lib/dock/*.
 *
 * - projects: per-project ProjectDockState, persisted under "masarflow-dock-v1".
 * - drag: transient pointer/drag state, never persisted.
 * - In the browser, persistence uses localStorage; in non-DOM environments
 *   (tests, SSR utilities) it falls back to an in-memory storage.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { defaultProjectState, WORKSPACE_PRESETS } from "@/lib/dock/presets";
import { parseProjectState } from "@/lib/dock/serde";
import type {
  DockNode,
  DockZone,
  ProjectDockState,
} from "@/lib/dock/types";
import {
  applyUrlFocus,
  closeEverywhere,
  dockFloater,
  floatPanel,
  focusFloater,
  moveFloater,
  resizeFloater,
  resetWorkspace,
  saveWorkspaceAs,
  switchWorkspace,
  toggleCollapse,
  toggleFloaterMaximized,
  toggleFloaterMinimized,
  toggleMaximize,
} from "@/lib/dock/dock-core";
import {
  findHolder,
  focusPanel,
  insertPanel,
  movePanel,
  reorderTab,
  resizeSplit,
} from "@/lib/dock/tree";

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

/** Where a drag started. */
export type DragSource =
  | { kind: "panel"; panelId: string; nodeId: string }
  | { kind: "group"; nodeId: string }
  | { kind: "floater"; floaterId: string; panelIds: string[] };

/** Transient drag state (never persisted). */
export interface DockDragState {
  source: DragSource;
  pointer: { x: number; y: number };
  /** Zone under the pointer, or null when over no drop target. */
  zone: DockZone | null;
  /** Node id (or "root") under the pointer, when applicable. */
  targetId: string | null;
}

interface DockStore {
  /** Persisted per-project dock states. */
  projects: Record<string, ProjectDockState>;
  /** Id of the project whose dock is live (mirrors useProjectStore). */
  activeProjectId: string | null;
  /** Transient drag state. */
  drag: DockDragState | null;

  getProject: () => ProjectDockState | null;
  setProject: (id: string | null) => void;

  // Page lifecycle
  open: (panelId: string) => void;
  close: (panelId: string) => void;
  focus: (panelId: string) => void;
  /** Insert an external payload (floater docking). */
  insert: (payload: DockNode, target: string | "root", zone: DockZone) => void;
  move: (panelId: string, target: string | "root", zone: DockZone) => void;
  reorder: (nodeId: string, panelId: string, index: number) => void;
  resize: (splitId: string, ratio: number) => void;

  // Floating windows
  float: (panelId: string, pos: { x: number; y: number }) => void;
  dockFloater: (
    floaterId: string,
    target: string | "root",
    zone: DockZone,
  ) => void;
  moveFloater: (floaterId: string, pos: { x: number; y: number }) => void;
  resizeFloater: (floaterId: string, size: { w: number; h: number }) => void;
  focusFloater: (floaterId: string) => void;
  toggleFloaterMinimized: (floaterId: string) => void;
  toggleFloaterMaximized: (floaterId: string) => void;

  // Panel states
  toggleCollapse: (panelId: string) => void;
  toggleMaximize: (panelId: string) => void;

  // Workspaces
  setWorkspace: (name: string) => void;
  saveWorkspaceAs: (name: string) => void;
  resetWorkspace: () => void;

  // Drag
  setDrag: (drag: DockDragState | null) => void;
}

/** Deep-clone a tree node (workspaces must not share node objects). */
function cloneTree(node: DockNode): DockNode {
  switch (node.type) {
    case "split":
      return { ...node, children: node.children.map(cloneTree) };
    case "tabs":
      return { ...node, pages: [...node.pages] };
    case "page":
      return { ...node };
  }
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

export const useDockStore = create<DockStore>()(
  persist(
    (set, get) => ({
      projects: {},
      activeProjectId: null,
      drag: null,

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
          if (!projects[id]) projects[id] = defaultProjectState();
          return { activeProjectId: id, projects };
        }),

      open: (panelId) =>
        set((s) =>
          update(s, (state) => applyUrlFocus(state, panelId)),
        ),

      close: (panelId) =>
        set((s) => update(s, (state) => closeEverywhere(state, panelId))),

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

      insert: (payload, target, zone) =>
        set((s) =>
          update(s, (state) => ({
            ...state,
            workspaces: {
              ...state.workspaces,
              [state.activeWorkspace]: {
                ...state.workspaces[state.activeWorkspace],
                tree: insertPanel(
                  state.workspaces[state.activeWorkspace].tree,
                  payload,
                  target,
                  zone,
                ),
              },
            },
          })),
        ),

      move: (panelId, target, zone) =>
        set((s) =>
          update(s, (state) => ({
            ...state,
            workspaces: {
              ...state.workspaces,
              [state.activeWorkspace]: {
                ...state.workspaces[state.activeWorkspace],
                tree: movePanel(
                  state.workspaces[state.activeWorkspace].tree,
                  panelId,
                  target,
                  zone,
                ),
              },
            },
          })),
        ),

      reorder: (nodeId, panelId, index) =>
        set((s) =>
          update(s, (state) => ({
            ...state,
            workspaces: {
              ...state.workspaces,
              [state.activeWorkspace]: {
                ...state.workspaces[state.activeWorkspace],
                tree: reorderTab(
                  state.workspaces[state.activeWorkspace].tree,
                  nodeId,
                  panelId,
                  index,
                ),
              },
            },
          })),
        ),

      resize: (splitId, ratio) =>
        set((s) =>
          update(s, (state) => ({
            ...state,
            workspaces: {
              ...state.workspaces,
              [state.activeWorkspace]: {
                ...state.workspaces[state.activeWorkspace],
                tree: resizeSplit(
                  state.workspaces[state.activeWorkspace].tree,
                  splitId,
                  ratio,
                ),
              },
            },
          })),
        ),

      float: (panelId, pos) =>
        set((s) => update(s, (state) => floatPanel(state, panelId, pos))),

      dockFloater: (floaterId, target, zone) =>
        set((s) =>
          update(s, (state) => dockFloater(state, floaterId, target, zone)),
        ),

      moveFloater: (floaterId, pos) =>
        set((s) =>
          update(s, (state) => moveFloater(state, floaterId, pos)),
        ),

      resizeFloater: (floaterId, size) =>
        set((s) =>
          update(s, (state) => resizeFloater(state, floaterId, size)),
        ),

      focusFloater: (floaterId) =>
        set((s) =>
          update(s, (state) => focusFloater(state, floaterId)),
        ),

      toggleFloaterMinimized: (floaterId) =>
        set((s) =>
          update(s, (state) =>
            toggleFloaterMinimized(state, floaterId),
          ),
        ),

      toggleFloaterMaximized: (floaterId) =>
        set((s) =>
          update(s, (state) =>
            toggleFloaterMaximized(state, floaterId),
          ),
        ),

      toggleCollapse: (panelId) =>
        set((s) => update(s, (state) => toggleCollapse(state, panelId))),

      toggleMaximize: (panelId) =>
        set((s) => update(s, (state) => toggleMaximize(state, panelId))),

      setWorkspace: (name) =>
        set((s) => update(s, (state) => switchWorkspace(state, name))),

      saveWorkspaceAs: (name) =>
        set((s) =>
          update(s, (state) => saveWorkspaceAs(state, name)),
        ),

      resetWorkspace: () =>
        set((s) =>
          update(s, (state) => {
            const preset = WORKSPACE_PRESETS[state.activeWorkspace];
            return resetWorkspace(
              state,
              preset ? cloneTree(preset.tree) : state.workspaces[state.activeWorkspace].tree,
            );
          }),
        ),

      setDrag: (drag) => set({ drag }),
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
            if (parsed) projects[id] = parsed;
          }
        }
        const activeProjectId =
          typeof raw.activeProjectId === "string" ? raw.activeProjectId : null;
        return {
          ...current,
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
