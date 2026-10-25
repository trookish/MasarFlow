import { useSyncExternalStore } from "react";

/**
 * Studio layout keeps at most four panels mounted (v0.3 P5 T6). Visible panels always stay
 * mounted; hidden tabs keep their state (drafts, scroll, streams) only while they are among the
 * four most recently shown. Past that the least recently shown one unmounts and remounts fresh
 * when its tab is chosen again.
 */
export const MAX_MOUNTED_PANELS = 4;

/** Move `panelId` to the front of the recency list. Pure. */
export function touch(lru: readonly string[], panelId: string): string[] {
  return [panelId, ...lru.filter((p) => p !== panelId)];
}

/** Panels that stay mounted: every visible one, then the most recent hidden ones up to the cap. Pure. */
export function mountedSet(
  lru: readonly string[],
  visible: readonly string[],
  max = MAX_MOUNTED_PANELS,
): Set<string> {
  const keep = new Set(visible);
  for (const p of lru) {
    if (keep.size >= max) break;
    keep.add(p);
  }
  return keep;
}

// One recency list per window; the dock shows one project at a time.
let lru: string[] = [];
const visible = new Map<string, number>(); // panelId -> how many groups show it
const listeners = new Set<() => void>();
let snapshot = mountedSet(lru, []);

function publish() {
  snapshot = mountedSet(lru, [...visible.keys()]);
  for (const l of listeners) l();
}

/** A panel became the active tab of a group. Returns the matching cleanup. */
export function showPanel(panelId: string): () => void {
  lru = touch(lru, panelId);
  visible.set(panelId, (visible.get(panelId) ?? 0) + 1);
  publish();
  return () => {
    const n = (visible.get(panelId) ?? 1) - 1;
    if (n <= 0) visible.delete(panelId);
    else visible.set(panelId, n);
    publish();
  };
}

/** Whether a panel should keep its component mounted. */
export function useIsMounted(panelId: string): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot.has(panelId),
    () => true,
  );
}

/** Test seam. */
export function resetMountCap(): void {
  lru = [];
  visible.clear();
  publish();
}
