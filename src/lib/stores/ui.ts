import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Where the taskbar (nav rail + panel) sits: left edge, right edge, or a floating bottom dock. */
export type TaskbarDirection = "left" | "bottom" | "right";

/**
 * Standard: six surfaces in a sidebar + main + inspector shell (v0.3 default).
 * Studio: the dock window manager with tiled panels (opt-in).
 */
export type LayoutMode = "standard" | "studio";

interface PersistedV0 {
  sidebarCollapsed?: boolean;
  activeNavGroup?: string;
  taskbarDirection?: TaskbarDirection;
  dockEnabled?: boolean;
}

/**
 * v0 → v1: the dock stops being the default. A user keeps the Studio layout only when they
 * visibly customised it (moved the taskbar or tiled more than one panel); everyone else moves
 * to the standard layout and sees a one-time notice offering Studio. `activeNavGroup` is dropped.
 */
export function migrateUi(persisted: unknown, version: number, dockPanelCount = 0): Record<string, unknown> {
  const s = (persisted ?? {}) as PersistedV0 & Record<string, unknown>;
  if (version >= 1) return s;
  const customised = s.dockEnabled !== false && ((s.taskbarDirection ?? "bottom") !== "bottom" || dockPanelCount > 1);
  return {
    sidebarCollapsed: s.sidebarCollapsed ?? false,
    taskbarDirection: s.taskbarDirection ?? "bottom",
    layoutMode: customised ? "studio" : "standard",
    // Only users who were moved off the dock need the notice.
    layoutNoticeSeen: customised || s.dockEnabled === false || persisted == null,
  };
}

/** Panels in the persisted dock layout (read once during migration). */
function storedDockPanelCount(): number {
  try {
    const raw = globalThis.localStorage?.getItem("masarflow-dock-v1");
    if (!raw) return 0;
    const matches = raw.match(/"pageId"/g);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

interface UIState {
  /** Sidebar collapsed to icon rail. Persisted. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;

  /** Which nav group is active in the Studio layout's two-rail sidebar (not persisted). */
  activeNavGroup: string;
  setActiveNavGroup: (group: string) => void;

  /** Standard (surfaces) or Studio (dock). Persisted. */
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  /** The one-time "Studio layout is available" notice was dismissed. Persisted. */
  layoutNoticeSeen: boolean;
  dismissLayoutNotice: () => void;

  /** Taskbar placement. Persisted. */
  taskbarDirection: TaskbarDirection;
  setTaskbarDirection: (direction: TaskbarDirection) => void;

  /** Dock window manager on/off. Derived from `layoutMode` (true in Studio). */
  dockEnabled: boolean;
  setDockEnabled: (value: boolean) => void;

  /** Transient overlay state (not persisted). */
  paletteOpen: boolean;
  setPaletteOpen: (value: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (value: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (value: boolean) => void;
  /** P7: Ctrl/Cmd+O quick switcher (transient). */
  quickSwitchOpen: boolean;
  setQuickSwitchOpen: (value: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      activeNavGroup: "Capture",
      setActiveNavGroup: (activeNavGroup) => set({ activeNavGroup }),

      taskbarDirection: "bottom",
      setTaskbarDirection: (taskbarDirection) => set({ taskbarDirection }),

      layoutMode: "standard",
      setLayoutMode: (layoutMode) => set({ layoutMode, dockEnabled: layoutMode === "studio" }),
      layoutNoticeSeen: true,
      dismissLayoutNotice: () => set({ layoutNoticeSeen: true }),

      dockEnabled: false,
      setDockEnabled: (dockEnabled) => set({ dockEnabled, layoutMode: dockEnabled ? "studio" : "standard" }),

      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      searchOpen: false,
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      quickSwitchOpen: false,
      setQuickSwitchOpen: (quickSwitchOpen) => set({ quickSwitchOpen }),
    }),
    {
      name: "masarflow-ui",
      version: 1,
      migrate: (persisted, version) => migrateUi(persisted, version, storedDockPanelCount()) as unknown as UIState,
      // Only layout prefs persist; `dockEnabled` is derived from `layoutMode` on rehydrate.
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        taskbarDirection: s.taskbarDirection,
        layoutMode: s.layoutMode,
        layoutNoticeSeen: s.layoutNoticeSeen,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UIState>;
        const layoutMode = p.layoutMode ?? current.layoutMode;
        return { ...current, ...p, layoutMode, dockEnabled: layoutMode === "studio" };
      },
    },
  ),
);
