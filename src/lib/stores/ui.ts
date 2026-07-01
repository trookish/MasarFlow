import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  /** Sidebar collapsed to icon rail. Persisted. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;

  /** Which nav group is active in the two-rail sidebar. Persisted. */
  activeNavGroup: string;
  setActiveNavGroup: (group: string) => void;

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

      activeNavGroup: "Workspace",
      setActiveNavGroup: (activeNavGroup) => set({ activeNavGroup }),

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
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, activeNavGroup: s.activeNavGroup }),
    },
  ),
);
