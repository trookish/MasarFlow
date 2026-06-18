import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Available accent palettes — mirrors the `[data-accent]` rules in globals.css. */
export const ACCENTS = [
  "violet",
  "cyan",
  "emerald",
  "rose",
  "amber",
  "blue",
] as const;

export type Accent = (typeof ACCENTS)[number];

interface ThemeState {
  accent: Accent;
  setAccent: (accent: Accent) => void;
}

/** Persisted accent selection. Light/dark itself is owned by next-themes. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      accent: "violet",
      setAccent: (accent) => set({ accent }),
    }),
    { name: "masarflow-theme" },
  ),
);
