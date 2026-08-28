"use client";

/**
 * URL <-> dock sync — the contract that keeps routing alive under the dock.
 *
 * One converged effect handles both directions; a ref decides which signal
 * is authoritative:
 * - URL changed since last run -> the URL wins: focus-or-open the panel for
 *   the current URL, then read the FRESH state and mirror the focused
 *   panel's URL back if it differs (replaces, never pushes — no history
 *   spam; back/forward keep working because they change the URL).
 * - Dock focus changed (tab click, drag, close) -> mirror the focused
 *   panel's URL into the address bar.
 *
 * Reading the state via getState() AFTER open() is what prevents the
 * cold-load race: a deep link to a non-default page must not be reverted to
 * the default panel by a stale render-time focus value.
 *
 * The hook calls useSearchParams, so it must be rendered inside a <Suspense>
 * boundary (same pattern the workspace pages use for their views).
 */

import { useEffect, useRef } from "react";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useProjectStore } from "@/lib/stores/project";
import { useDockStore } from "@/lib/stores/dock";
import { urlOfFocused } from "@/lib/dock/dock-core";

export function useDockSync(): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setProject = useDockStore((s) => s.setProject);

  // Mirror the active project into the dock store (initializes its state).
  useEffect(() => {
    setProject(activeProjectId);
  }, [activeProjectId, setProject]);

  const search = searchParams?.toString() ?? "";
  const currentUrl = search ? `${pathname}?${search}` : pathname;

  // Re-render trigger for dock-side focus changes (tab clicks, closes...).
  const focusedUrl = useDockStore((s) => {
    const state = s.activeProjectId ? s.projects[s.activeProjectId] : null;
    return state ? urlOfFocused(state) : null;
  });

  const prevUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;
    const store = useDockStore.getState();
    const urlChanged = prevUrlRef.current !== currentUrl;
    prevUrlRef.current = currentUrl;

    if (urlChanged) {
      // URL is authoritative: focus-or-open, then mirror from FRESH state.
      store.open(currentUrl);
      const freshState = store.getProject();
      const fresh = freshState ? urlOfFocused(freshState) : null;
      if (fresh && fresh !== currentUrl) router.replace(fresh);
      return;
    }

    // Dock focus changed. The render closure's focusedUrl can be stale
    // (StrictMode double-invokes this effect with the mount render's
    // closure after the URL branch already updated the store), so verify
    // against the LIVE state before touching the URL.
    if (focusedUrl !== currentUrl) {
      const liveState = store.getProject();
      const live = liveState ? urlOfFocused(liveState) : null;
      if (live && live !== currentUrl) router.replace(live);
    }
  }, [currentUrl, focusedUrl, activeProjectId, router]);
}
