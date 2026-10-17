"use client";

import { useCallback, useMemo, useState } from "react";
import { gitBridge } from "@/lib/git/client";

/**
 * P6.T9 placeholder: the real root-selection/status hook lands in P6.T10
 * (`use-git-repo.test.ts` pins its pure reducer). This stub keeps the /git
 * route compiling and rendering the desktop-required state until then.
 */
export function useGitRepo() {
  const bridge = useMemo(() => gitBridge(), []);
  const [loading] = useState(false);
  const refresh = useCallback(async (): Promise<void> => undefined, []);
  return {
    root: null as string | null,
    branch: null as string | null,
    detached: false,
    loading,
    error: null,
    status: null,
    refresh,
    bridge,
  };
}

export type GitRepo = ReturnType<typeof useGitRepo>;
