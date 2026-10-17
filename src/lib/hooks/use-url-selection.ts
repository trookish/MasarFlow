"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readSelection, selectionFor, withSelection } from "@/lib/entities/url";

/**
 * Selection stored in the URL so it can be deep-linked and opened by openEntity().
 * `path` is THIS page's route (e.g. "/sprints"); it is explicit because under the
 * dock `usePathname()` is always the focused panel's path, not ours.
 */
export function useUrlSelection(
  path: string,
  param: string,
): [string | null, (id: string | null) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const onThisPage = pathname === path;
  const live = onThisPage ? readSelection(search, param) : null;
  const [kept, setKept] = useState<string | null>(live);
  useEffect(() => {
    if (onThisPage) setKept(live);
  }, [onThisPage, live]);

  const select = useCallback(
    (id: string | null) => {
      const base = onThisPage ? search : "";
      router.replace(`${path}?${withSelection(base, param, id)}`, { scroll: false });
      setKept(id);
    },
    [router, path, param, search, onThisPage],
  );

  return [selectionFor(pathname, path, search, param, kept), select];
}
