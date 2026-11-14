"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { memoryStorage } from "@/lib/stores/dock";
import { DEFAULT_FORCES, sanitizeForces, type ForceSettings } from "./layout";
import { GROUP_COLORS, type GraphGroup } from "./groups";

export interface DisplaySettings {
  /** Bigger nodes for better-connected notes. */
  sizeByLinks: boolean;
  /** Draw arrowheads on edges. */
  arrows: boolean;
  /** Labels appear once the zoom reaches this level; 0 shows them always, the max hides them. */
  labelZoom: number;
}

export const DEFAULT_DISPLAY: DisplaySettings = { sizeByLinks: true, arrows: false, labelZoom: 0.6 };
export const LABEL_ZOOM_LIMITS = { min: 0, max: 3, step: 0.1 };

export interface GraphPrefs {
  forces: ForceSettings;
  display: DisplaySettings;
  groups: GraphGroup[];
  controlsOpen: boolean;
  minimap: boolean;
  setForces: (patch: Partial<ForceSettings>) => void;
  resetForces: () => void;
  setDisplay: (patch: Partial<DisplaySettings>) => void;
  addGroup: (query: string) => void;
  updateGroup: (id: string, patch: Partial<Omit<GraphGroup, "id">>) => void;
  removeGroup: (id: string) => void;
  setControlsOpen: (open: boolean) => void;
  setMinimap: (on: boolean) => void;
}

let groupSeq = 0;

export const useGraphPrefs = create<GraphPrefs>()(
  persist(
    (set) => ({
      forces: DEFAULT_FORCES,
      display: DEFAULT_DISPLAY,
      groups: [],
      controlsOpen: true,
      minimap: true,
      setForces: (patch) => set((s) => ({ forces: sanitizeForces({ ...s.forces, ...patch }) })),
      resetForces: () => set({ forces: DEFAULT_FORCES }),
      setDisplay: (patch) => set((s) => ({ display: { ...s.display, ...patch } })),
      addGroup: (query) =>
        set((s) => {
          const q = query.trim();
          if (!q) return s;
          const color = GROUP_COLORS[s.groups.length % GROUP_COLORS.length].token;
          groupSeq += 1;
          return { groups: [...s.groups, { id: `g${Date.now().toString(36)}${groupSeq}`, query: q, color }] };
        }),
      updateGroup: (id, patch) =>
        set((s) => ({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
      removeGroup: (id) => set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),
      setControlsOpen: (controlsOpen) => set({ controlsOpen }),
      setMinimap: (minimap) => set({ minimap }),
    }),
    {
      name: "masarflow-graph-prefs-v1",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? window.localStorage : memoryStorage)),
      partialize: (s) => ({
        forces: s.forces,
        display: s.display,
        groups: s.groups,
        controlsOpen: s.controlsOpen,
        minimap: s.minimap,
      }),
      // Persisted JSON is untrusted: validate every field, fall back to defaults.
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<GraphPrefs>;
        const display: DisplaySettings = { ...DEFAULT_DISPLAY };
        if (raw.display) {
          if (typeof raw.display.sizeByLinks === "boolean") display.sizeByLinks = raw.display.sizeByLinks;
          if (typeof raw.display.arrows === "boolean") display.arrows = raw.display.arrows;
          if (typeof raw.display.labelZoom === "number" && Number.isFinite(raw.display.labelZoom)) {
            display.labelZoom = Math.min(LABEL_ZOOM_LIMITS.max, Math.max(LABEL_ZOOM_LIMITS.min, raw.display.labelZoom));
          }
        }
        const groups = Array.isArray(raw.groups)
          ? raw.groups.filter(
              (g): g is GraphGroup =>
                !!g && typeof g.id === "string" && typeof g.query === "string" && typeof g.color === "string",
            )
          : [];
        return {
          ...current,
          forces: sanitizeForces(raw.forces),
          display,
          groups,
          controlsOpen: typeof raw.controlsOpen === "boolean" ? raw.controlsOpen : current.controlsOpen,
          minimap: typeof raw.minimap === "boolean" ? raw.minimap : current.minimap,
        };
      },
    },
  ),
);
