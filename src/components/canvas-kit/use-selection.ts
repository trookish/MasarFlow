"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  EMPTY_SELECTION,
  applyClick,
  applyMarquee,
  pruneSelection,
  selectAll as selectAllIds,
  type IdSet,
  type SelectMode,
} from "./selection";

export interface UseSelection {
  selected: IdSet;
  /** The most recently selected id (what a single-item inspector shows), or null. */
  primary: string | null;
  size: number;
  has: (id: string) => boolean;
  /** Click on an item. */
  click: (id: string, mode?: SelectMode) => void;
  /** Replace the selection with exactly these ids. */
  set: (ids: Iterable<string>, primary?: string | null) => void;
  selectAll: (ids: Iterable<string>) => void;
  clear: () => void;
  /** Drop ids that are gone. */
  prune: (exists: (id: string) => boolean) => void;
  /** Begin a marquee: remembers the selection to combine with. */
  beginMarquee: () => void;
  /** Update the selection as the marquee grows. */
  updateMarquee: (hits: Iterable<string>, mode: SelectMode) => void;
}

/** Single, toggle, additive, select-all, clear and marquee selection over string ids. */
export function useSelection(initial: Iterable<string> = []): UseSelection {
  const [state, setState] = useState<{ selected: IdSet; primary: string | null }>(() => {
    const ids = [...initial];
    return { selected: ids.length ? new Set(ids) : EMPTY_SELECTION, primary: ids[ids.length - 1] ?? null };
  });
  const marqueeBase = useRef<IdSet>(EMPTY_SELECTION);

  const click = useCallback((id: string, mode: SelectMode = "replace") => {
    setState((s) => {
      const selected = applyClick(s.selected, id, mode);
      const primary = selected.has(id) ? id : ([...selected].pop() ?? null);
      return selected === s.selected && primary === s.primary ? s : { selected, primary };
    });
  }, []);

  const set = useCallback((ids: Iterable<string>, primary?: string | null) => {
    const next = new Set(ids);
    setState({
      selected: next.size ? next : EMPTY_SELECTION,
      primary: primary !== undefined ? primary : ([...next].pop() ?? null),
    });
  }, []);

  const selectAll = useCallback((ids: Iterable<string>) => {
    const next = selectAllIds(ids);
    setState({ selected: next, primary: [...next].pop() ?? null });
  }, []);

  const clear = useCallback(() => {
    setState((s) => (s.selected.size === 0 ? s : { selected: EMPTY_SELECTION, primary: null }));
  }, []);

  const prune = useCallback((exists: (id: string) => boolean) => {
    setState((s) => {
      const selected = pruneSelection(s.selected, exists);
      if (selected === s.selected) return s;
      const primary = s.primary && selected.has(s.primary) ? s.primary : ([...selected].pop() ?? null);
      return { selected, primary };
    });
  }, []);

  const beginMarquee = useCallback(() => {
    marqueeBase.current = state.selected;
  }, [state.selected]);

  const updateMarquee = useCallback((hits: Iterable<string>, mode: SelectMode) => {
    const next = applyMarquee(marqueeBase.current, hits, mode);
    setState((s) => {
      if (next.size === s.selected.size && [...next].every((id) => s.selected.has(id))) return s;
      return { selected: next, primary: [...next].pop() ?? null };
    });
  }, []);

  return useMemo(
    () => ({
      selected: state.selected,
      primary: state.primary,
      size: state.selected.size,
      has: (id: string) => state.selected.has(id),
      click,
      set,
      selectAll,
      clear,
      prune,
      beginMarquee,
      updateMarquee,
    }),
    [state, click, set, selectAll, clear, prune, beginMarquee, updateMarquee],
  );
}
