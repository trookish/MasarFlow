"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { normalizeToolViewMode, type ToolViewMode } from "./tool-groups";

interface ToolViewState {
  mode: ToolViewMode;
  setMode: (mode: ToolViewMode) => void;
}

const memoryStorage = (() => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
})();

/**
 * How the chat renders tool calls (Verbose / Normal / Summary). Persisted in
 * local storage like the other interface preferences, so it survives reloads.
 */
export const useToolView = create<ToolViewState>()(
  persist(
    (set) => ({
      mode: "normal",
      setMode: (mode) => set({ mode: normalizeToolViewMode(mode) }),
    }),
    {
      name: "masarflow-chat-tool-view",
      storage: createJSONStorage(() =>
        typeof localStorage === "undefined" ? memoryStorage : localStorage,
      ),
      merge: (persisted, current) => ({
        ...current,
        mode: normalizeToolViewMode(
          (persisted as Partial<ToolViewState> | undefined)?.mode,
        ),
      }),
    },
  ),
);
