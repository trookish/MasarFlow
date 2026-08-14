import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Where the taskbar (nav rail + panel) sits: left edge, right edge, or a floating bottom dock. */
export type TaskbarDirection = "left" | "bottom" | "right";

interface UIState {
  /** Sidebar collapsed to icon rail. Persisted. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;

  /** Which nav group is active in the two-rail sidebar. Persisted. */
  activeNavGroup: string;
  setActiveNavGroup: (group: string) => void;

  /** Taskbar placement. Persisted. */
  taskbarDirection: TaskbarDirection;
  setTaskbarDirection: (direction: TaskbarDirection) => void;

  /** Transient overlay state (not persisted). */
  paletteOpen: boolean;
  setPaletteOpen: (value: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (value: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (value: boolean) => void;
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

      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      searchOpen: false,
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      shortcutsOpen: false,
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    }),
    {
      name: "masarflow-ui",
      // Only sidebar layout prefs should persist.
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        activeNavGroup: s.activeNavGroup,
        taskbarDirection: s.taskbarDirection,
      }),
    },
  ),
);
