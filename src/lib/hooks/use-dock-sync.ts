"use client";

/**
 * URL <-> dock sync — the contract that keeps routing alive under the dock.
 *
 * 1. URL changes (sidebar links, command palette, deep links, back/forward)
 *    focus-or-open the matching panel and snapshot any query params onto it.
 * 2. Dock focus changes (tab clicks, drags, closes) mirror the focused
 *    panel's URL into the address bar via router.replace (no history spam).
 *
 * The two effects are idempotent: after a replace, the URL matches the
 * focused panel and neither effect acts again, so there is no loop.
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

  // URL -> dock: focus-or-open the panel for the current URL.
  useEffect(() => {
    if (!activeProjectId) return;
    useDockStore.getState().open(currentUrl);
  }, [currentUrl, activeProjectId]);

  // dock -> URL: mirror the focused panel into the address bar.
  const focusedUrl = useDockStore((s) => {
    const state = s.activeProjectId ? s.projects[s.activeProjectId] : null;
    return state ? urlOfFocused(state) : null;
  });

  // The last URL we pushed ourselves; replaces are skipped when the dock
  // hasn't moved since, so a replace -> effect cycle terminates immediately.
  const lastReplacedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusedUrl) return;
    if (focusedUrl === currentUrl) {
      lastReplacedRef.current = focusedUrl;
      return;
    }
    if (lastReplacedRef.current === focusedUrl) return;
    lastReplacedRef.current = focusedUrl;
    router.replace(focusedUrl);
  }, [focusedUrl, currentUrl, router]);
}
