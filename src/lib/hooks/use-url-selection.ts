"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readSelection, selectionFor, withSelection } from "@/lib/entities/url";
import { isPageLocation, locate, pageUrl } from "@/lib/navigation/surfaces";
import { useDockStore } from "@/lib/stores/dock";

/**
 * The selection this page last had while focused, as persisted in the dock's
 * per-panel URL snapshot. A panel restored after a reload starts unfocused, so
 * the app URL belongs to another panel; the snapshot is the only place its
 * selection survives (P9: the dock's persisted panel URL brings it back).
 */
function usePanelSnapshot(path: string, param: string): string | null {
  return useDockStore((s) => {
    const st = s.activeProjectId ? s.projects[s.activeProjectId] : null;
    const entry = st?.workspaces[st.activeWorkspace];
    // Tabs are keyed by surface route ("/work"); the snapshot is ours only while
    // that tab shows our section (view=specs).
    const tab = locate(path)?.surface.route ?? path;
    const query = entry?.params[tab] ?? "";
    return isPageLocation(path, tab, query) ? readSelection(query, param) : null;
  });
}

/**
 * Selection stored in the URL so it can be deep-linked and opened by openEntity().
 * `path` is THIS page's route (e.g. "/sprints"); it is explicit because
 * `usePathname()` is always the focused tab's path, and since 0.2 the page is
 * hosted as a surface section ("/work?view=sprints").
 */
export function useUrlSelection(
  path: string,
  param: string,
): [string | null, (id: string | null) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const onThisPage = isPageLocation(path, pathname, search);
  const live = onThisPage ? readSelection(search, param) : null;
  const snapshot = usePanelSnapshot(path, param);
  const [kept, setKept] = useState<string | null>(live ?? snapshot);
  // Remember the last value seen while THIS page was focused (derived state,
  // adjusted during render). An effect would be the other option, but the
  // repo's react-hooks rules reject setState-in-effect; this also skips the
  // stale commit that an effect would produce.
  if (onThisPage && kept !== live) setKept(live);

  const select = useCallback(
    (id: string | null) => {
      const base = onThisPage ? search : "";
      router.replace(pageUrl(path, withSelection(base, param, id)), { scroll: false });
      setKept(id);
    },
    [router, path, param, search, onThisPage],
  );

  return [selectionFor(pathname, path, search, param, kept), select];
}
