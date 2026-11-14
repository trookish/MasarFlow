import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  INSPECTOR_DEFAULT_WIDTH,
  clampInspectorWidth,
} from "@/lib/inspector/presentation";

/** Where the surface navigation sits: a rail on either edge, or a floating dock. */
export type SidebarPosition = "left" | "bottom" | "right";

export const SIDEBAR_POSITIONS: readonly SidebarPosition[] = ["left", "bottom", "right"];

interface PersistedUi {
  sidebarCollapsed?: boolean;
  inspectorOpen?: boolean;
  inspectorWidth?: number;
  inspectorPinned?: boolean;
  sidebarPosition?: unknown;
  dockCollapsed?: boolean;
  /** 0.1 name of the position preference. */
  taskbarDirection?: unknown;
}

function asPosition(value: unknown): SidebarPosition | null {
  return SIDEBAR_POSITIONS.includes(value as SidebarPosition) ? (value as SidebarPosition) : null;
}

/**
 * v0/v1 → v3: remove the retired Studio preferences; the 0.1 taskbar direction
 * becomes the sidebar position. v2 → v3: add the position and dock state.
 */
export function migrateUi(persisted: unknown, _version: number): Record<string, unknown> {
  void _version;
  const state = (persisted ?? {}) as PersistedUi;
  return {
    sidebarCollapsed: state.sidebarCollapsed ?? false,
    inspectorOpen: state.inspectorOpen ?? true,
    sidebarPosition: asPosition(state.sidebarPosition) ?? asPosition(state.taskbarDirection) ?? "left",
    dockCollapsed: state.dockCollapsed ?? false,
  };
}

interface UIState {
  /** Surface navigation collapsed to an icon rail. Persisted. */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  /** Edge the surface navigation sits on. Persisted. */
  sidebarPosition: SidebarPosition;
  setSidebarPosition: (value: SidebarPosition) => void;
  /** Bottom dock folded down to its reopen button. Persisted. */
  dockCollapsed: boolean;
  setDockCollapsed: (value: boolean) => void;
  /** Ctrl+B and the topbar button: collapse the rail, or fold the dock in bottom mode. */
  toggleNavigation: () => void;
  /** Right-hand entity and surface inspector. Persisted. */
  inspectorOpen: boolean;
  toggleInspector: () => void;
  setInspectorOpen: (value: boolean) => void;
  /** Docked Inspector width in px (clamped by the resize handle). Persisted. */
  inspectorWidth: number;
  setInspectorWidth: (value: number) => void;
  /** Keep the Inspector as a column on pages that otherwise float it (board, canvas, graph, diagram). Persisted. */
  inspectorPinned: boolean;
  setInspectorPinned: (value: boolean) => void;

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
      sidebarPosition: "left",
      setSidebarPosition: (sidebarPosition) => set({ sidebarPosition }),
      dockCollapsed: false,
      setDockCollapsed: (dockCollapsed) => set({ dockCollapsed }),
      toggleNavigation: () =>
        set((s) =>
          s.sidebarPosition === "bottom"
            ? { dockCollapsed: !s.dockCollapsed }
            : { sidebarCollapsed: !s.sidebarCollapsed },
        ),
      inspectorOpen: true,
      toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      inspectorWidth: INSPECTOR_DEFAULT_WIDTH,
      setInspectorWidth: (inspectorWidth) => set({ inspectorWidth: clampInspectorWidth(inspectorWidth) }),
      inspectorPinned: false,
      setInspectorPinned: (inspectorPinned) => set({ inspectorPinned }),

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
      version: 3,
      migrate: (persisted, version) => migrateUi(persisted, version) as unknown as UIState,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        inspectorOpen: state.inspectorOpen,
        inspectorWidth: state.inspectorWidth,
        inspectorPinned: state.inspectorPinned,
        sidebarPosition: state.sidebarPosition,
        dockCollapsed: state.dockCollapsed,
      }),
      merge: (persisted, current) => {
        const p = persisted as PersistedUi | null;
        return {
          ...current,
          sidebarCollapsed: p?.sidebarCollapsed ?? current.sidebarCollapsed,
          inspectorOpen: p?.inspectorOpen ?? current.inspectorOpen,
          inspectorWidth: clampInspectorWidth(p?.inspectorWidth ?? current.inspectorWidth),
          inspectorPinned: p?.inspectorPinned ?? current.inspectorPinned,
          sidebarPosition: asPosition(p?.sidebarPosition) ?? current.sidebarPosition,
          dockCollapsed: p?.dockCollapsed ?? current.dockCollapsed,
        };
      },
    },
  ),
);
