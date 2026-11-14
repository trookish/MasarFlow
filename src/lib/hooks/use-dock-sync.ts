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
 * A URL that arrives because this hook mirrored it (the echo of our own
 * replace) is not a navigation: the dock may have moved on while the replace
 * was in flight (close a tab, then Ctrl+Shift+T at once), and letting the late
 * echo win would refocus the closed tab's neighbour over the reopened one.
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
import { useRecentStore } from "@/lib/stores/recent";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";
import { urlOfFocused } from "@/lib/dock/dock-core";
import { collectPages } from "@/lib/dock/tree";
import type { ProjectDockState } from "@/lib/dock/types";

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
  /** Pages open in the dock when this effect last ran (null until the first run). */
  const prevPagesRef = useRef<{ project: string; pages: ReadonlySet<string> } | null>(null);
  /** The URL our last mirror replace asked for, until the router reports it. */
  const mirroredRef = useRef<string | null>(null);

  // Mirroring is only safe when Next's view of the URL matches the address bar.
  // On a cold start useSearchParams lags (it reports "/today" while the bar
  // already reads "/today?view=dashboard"), and a replace issued from that stale
  // view lands after a click the user made in the meantime, so the click is lost.
  // The effect runs again once the router catches up, and it mirrors then.
  const replaceIfSettled = (target: string) => {
    const live = liveAddress();
    if (live !== null && live !== currentUrl) return;
    if (target === live) return;
    mirroredRef.current = target;
    router.replace(target);
  };

  useEffect(() => {
    if (!activeProjectId) return;
    const store = useDockStore.getState();
    const urlChanged = prevUrlRef.current !== currentUrl;
    prevUrlRef.current = currentUrl;

    const echo = urlChanged && mirroredRef.current === currentUrl;
    if (urlChanged) mirroredRef.current = null; // the router has caught up, echo or not

    // A URL change and a close can reach this effect in the same pass: a section click pushes
    // /library?view=docs, and Ctrl+W closes Library before the push's effect has run. The page was
    // open when the navigation was issued and is gone now, so the user closed it after navigating;
    // reopening it from the URL would silently undo the close. Mirror the dock instead.
    const openNow = openPages(store.getProject());
    const page = pageIdOf(currentUrl);
    const before = prevPagesRef.current;
    const closedSince = before?.project === activeProjectId && before.pages.has(page) && !openNow.has(page);
    prevPagesRef.current = { project: activeProjectId, pages: openNow };
    if (urlChanged && !echo && closedSince) store.amendLastClosed(currentUrl);

    if (urlChanged && !echo && !closedSince) {
      // URL is authoritative: focus-or-open, then mirror from FRESH state.
      store.open(currentUrl);
      prevPagesRef.current = { project: activeProjectId, pages: openPages(store.getProject()) };

      // Recent lane: a successful URL -> dock sync is a page visit. Record the
      // page PATH (not the query) so re-visits dedupe; the label is the page's
      // own name, never a raw path.
      const path = pageIdOf(currentUrl);
      useRecentStore.getState().rememberPage(activeProjectId, {
        id: path,
        label: getPageDef(path)?.label ?? path,
        href: path,
      });

      const freshState = store.getProject();
      const fresh = freshState ? urlOfFocused(freshState) : null;
      if (fresh && fresh !== currentUrl) replaceIfSettled(fresh);
      return;
    }

    // Dock focus changed (or our own mirror landed). The render closure's focusedUrl can be stale
    // (StrictMode double-invokes this effect with the mount render's
    // closure after the URL branch already updated the store), so verify
    // against the LIVE state before touching the URL.
    if (echo || closedSince || focusedUrl !== currentUrl) {
      const liveState = store.getProject();
      const live = liveState ? urlOfFocused(liveState) : null;
      if (live && live !== currentUrl) replaceIfSettled(live);
    }
    // replaceIfSettled closes over currentUrl and router, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl, focusedUrl, activeProjectId, router]);
}

/** Page ids open in the active workspace. */
function openPages(state: ProjectDockState | null | undefined): ReadonlySet<string> {
  if (!state) return new Set();
  return new Set(collectPages(state.workspaces[state.activeWorkspace].tree));
}

/** The address bar as path?query, normalised like useSearchParams().toString(). */
function liveAddress(): string | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search).toString();
  return search ? `${window.location.pathname}?${search}` : window.location.pathname;
}
