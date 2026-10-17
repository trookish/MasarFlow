"use client";

/**
 * Recently used pages and entities, per project, for the palette's "Recent"
 * section. Two lanes (pages / entities) so opening five entities never pushes
 * the page you were on out of the list.
 *
 * Persisted (it is a preference, not a fact) and bounded (12 per lane).
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
// Reuse the existing non-DOM storage shim from the dock store (exported there).
import { memoryStorage } from "@/lib/stores/dock";

export interface RecentItem {
  /** Panel id / href for pages, entity id for entities. */
  id: string;
  kind: "page" | "entity";
  label: string;
  href: string;
  /** When it was last used (ms epoch). */
  at: number;
}

export const RECENT_LIMIT = 12;

/** Pure: push an item to the front of its lane, deduped, capped. */
export function pushRecent(
  list: RecentItem[],
  item: Omit<RecentItem, "at"> & { at?: number },
  at: number = Date.now(),
): RecentItem[] {
  // An `at` of 0 (or absent) means "stamp the visit now" — only a real
  // timestamp on the item beats the caller's visit time.
  const entry: RecentItem = { ...item, at: item.at || at };
  const lane = list.filter((existing) => existing.kind === entry.kind);
  const others = list.filter((existing) => existing.kind !== entry.kind);
  const next = [entry, ...lane.filter((existing) => existing.id !== entry.id)].slice(
    0,
    RECENT_LIMIT,
  );
  return [...next, ...others];
}

interface RecentStore {
  byProject: Record<string, RecentItem[]>;
  /** Record a page visit (panel id or route href). */
  rememberPage: (projectId: string, item: { id: string; label: string; href: string }) => void;
  /** Record an entity visit. */
  rememberEntity: (projectId: string, item: { id: string; label: string; href: string }) => void;
  /** The project's recents, newest first, pages in their own lane. */
  list: (projectId: string) => RecentItem[];
}

export const useRecentStore = create<RecentStore>()(
  persist(
    (set, get) => ({
      byProject: {},

      rememberPage: (projectId, item) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: pushRecent(s.byProject[projectId] ?? [], { ...item, kind: "page" }),
          },
        })),

      rememberEntity: (projectId, item) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: pushRecent(s.byProject[projectId] ?? [], { ...item, kind: "entity" }),
          },
        })),

      list: (projectId) => get().byProject[projectId] ?? [],
    }),
    {
      name: "masarflow-recent-v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : memoryStorage,
      ),
    },
  ),
);
