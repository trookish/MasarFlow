"use client";

import { create } from "zustand";

/**
 * Edits that have not reached the database yet, per tab. Editors autosave on a short debounce; while
 * an edit waits (or its write failed), the tab hosting the editor shows a dot. Not persisted: a reload
 * flushes or loses pending edits, and the dot must not outlive them.
 */
interface UnsavedStore {
  /** Page id of a tab → ids of the editors inside it that hold unsaved edits. */
  byPage: Record<string, string[]>;
  setUnsaved: (page: string, editor: string, unsaved: boolean) => void;
}

export const useUnsavedStore = create<UnsavedStore>()((set) => ({
  byPage: {},
  setUnsaved: (page, editor, unsaved) =>
    set((s) => {
      const current = s.byPage[page] ?? [];
      const has = current.includes(editor);
      if (unsaved === has) return {};
      const next = unsaved ? [...current, editor] : current.filter((e) => e !== editor);
      const byPage = { ...s.byPage };
      if (next.length > 0) byPage[page] = next;
      else delete byPage[page];
      return { byPage };
    }),
}));

/** True while any editor in this tab holds an edit that has not been written. */
export function useTabUnsaved(page: string): boolean {
  return useUnsavedStore((s) => (s.byPage[page]?.length ?? 0) > 0);
}
