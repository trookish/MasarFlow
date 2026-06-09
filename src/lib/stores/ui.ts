"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "comfortable" | "compact";
export type FontChoice = "inter" | "geist" | "system";

export type ThemeMode = "dark" | "light" | "system";
export type AccentColor = "violet" | "cyan" | "emerald" | "amber" | "rose" | "sky";

interface UiState {
  leftNavCollapsed: boolean;
  rightRailCollapsed: boolean;
  statusBarVisible: boolean;
  density: Density;
  font: FontChoice;
  theme: ThemeMode;
  accent: AccentColor;
  paletteOpen: boolean;
  searchOpen: boolean;
  projectSwitcherOpen: boolean;
  shortcutsCheatsheetOpen: boolean;
  toggleLeftNav: () => void;
  toggleRightRail: () => void;
  toggleStatusBar: () => void;
  setDensity: (d: Density) => void;
  setFont: (f: FontChoice) => void;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentColor) => void;
  setPaletteOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setProjectSwitcherOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      leftNavCollapsed: false,
      rightRailCollapsed: false,
      statusBarVisible: true,
      density: "comfortable",
      font: "inter",
      theme: "dark",
      accent: "violet",
      paletteOpen: false,
      searchOpen: false,
      projectSwitcherOpen: false,
      shortcutsCheatsheetOpen: false,
      toggleLeftNav: () => set((s) => ({ leftNavCollapsed: !s.leftNavCollapsed })),
      toggleRightRail: () => set((s) => ({ rightRailCollapsed: !s.rightRailCollapsed })),
      toggleStatusBar: () => set((s) => ({ statusBarVisible: !s.statusBarVisible })),
      setDensity: (density) => set({ density }),
      setFont: (font) => set({ font }),
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setProjectSwitcherOpen: (projectSwitcherOpen) => set({ projectSwitcherOpen }),
      setShortcutsOpen: (shortcutsCheatsheetOpen) => set({ shortcutsCheatsheetOpen }),
    }),
    {
      name: "masarflow.ui",
      partialize: (s) => ({
        leftNavCollapsed: s.leftNavCollapsed,
        rightRailCollapsed: s.rightRailCollapsed,
        statusBarVisible: s.statusBarVisible,
        density: s.density,
        font: s.font,
        theme: s.theme,
        accent: s.accent,
      }),
    },
  ),
);

export const ACCENTS: Record<AccentColor, { name: string; hue: number }> = {
  violet: { name: "Violet", hue: 278 },
  cyan: { name: "Cyan", hue: 200 },
  emerald: { name: "Emerald", hue: 152 },
  amber: { name: "Amber", hue: 75 },
  rose: { name: "Rose", hue: 0 },
  sky: { name: "Sky", hue: 230 },
};
