"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { memoryStorage } from "@/lib/stores/dock";

export type SavedPositions = Record<string, [number, number]>;

/** Layouts kept per browser profile; the least recently saved is dropped past this. */
export const MAX_SAVED_LAYOUTS = 12;

/** Storage id of one project's layout in one layout mode. */
export function layoutId(projectId: string, mode: string): string {
  return `${projectId}:${mode}`;
}

/** Positions from storage, dropping anything that is not a pair of finite numbers. */
export function sanitizePositions(raw: unknown): SavedPositions {
  const out: SavedPositions = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      out[key] = [value[0], value[1]];
    }
  }
  return out;
}

/** Pure: store `positions` under `id` and keep only the newest `MAX_SAVED_LAYOUTS`. */
export function withSavedLayout(
  state: { layouts: Record<string, SavedPositions>; order: string[] },
  id: string,
  positions: SavedPositions,
): { layouts: Record<string, SavedPositions>; order: string[] } {
  const order = [id, ...state.order.filter((o) => o !== id)].slice(0, MAX_SAVED_LAYOUTS);
  const layouts: Record<string, SavedPositions> = {};
  for (const o of order) layouts[o] = o === id ? positions : state.layouts[o];
  return { layouts, order };
}

interface PositionsStore {
  layouts: Record<string, SavedPositions>;
  order: string[];
  save: (id: string, positions: SavedPositions) => void;
  clear: (id: string) => void;
}

/**
 * Where nodes sit, per project and layout mode, so a graph looks the same tomorrow. Positions are
 * view state, not project data (no sync, no export), so they live in local storage beside the other
 * view preferences.
 */
export const useGraphPositions = create<PositionsStore>()(
  persist(
    (set) => ({
      layouts: {},
      order: [],
      save: (id, positions) => set((s) => withSavedLayout(s, id, positions)),
      clear: (id) =>
        set((s) => {
          const layouts = { ...s.layouts };
          delete layouts[id];
          return { layouts, order: s.order.filter((o) => o !== id) };
        }),
    }),
    {
      name: "masarflow-graph-positions-v1",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? window.localStorage : memoryStorage)),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as { layouts?: Record<string, unknown>; order?: unknown };
        const order = Array.isArray(raw.order) ? raw.order.filter((o): o is string => typeof o === "string") : [];
        const layouts: Record<string, SavedPositions> = {};
        for (const id of order.slice(0, MAX_SAVED_LAYOUTS)) layouts[id] = sanitizePositions(raw.layouts?.[id]);
        return { ...current, layouts, order: Object.keys(layouts) };
      },
    },
  ),
);
