import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PersistedUi {
  sidebarCollapsed?: boolean;
  inspectorOpen?: boolean;
}

/** v0/v1 → v2: remove the retired Studio and taskbar preferences. */
export function migrateUi(persisted: unknown, _version: number): Record<string, unknown> {
  void _version;
  const state = (persisted ?? {}) as PersistedUi;
  return { sidebarCollapsed: state.sidebarCollapsed ?? false, inspectorOpen: state.inspectorOpen ?? true };
}

interface UIState {
  /** Surface navigation collapsed to an icon rail. Persisted. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  /** Right-hand entity and surface inspector. Persisted. */
  inspectorOpen: boolean;
  toggleInspector: () => void;

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
      inspectorOpen: true,
      toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),

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
      version: 2,
      migrate: (persisted, version) => migrateUi(persisted, version) as unknown as UIState,
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, inspectorOpen: state.inspectorOpen }),
      merge: (persisted, current) => ({
        ...current,
        sidebarCollapsed:
          (persisted as PersistedUi | null)?.sidebarCollapsed ?? current.sidebarCollapsed,
        inspectorOpen: (persisted as PersistedUi | null)?.inspectorOpen ?? current.inspectorOpen,
      }),
    },
  ),
);
