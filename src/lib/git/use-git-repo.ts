"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDesktop } from "@/lib/desktop/bridge";
import { linkedProjectsRepo } from "@/lib/db/repos/linkedProjects";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { gitBridge } from "@/lib/git/client";
import { pickDefaultRoot } from "@/lib/git/format";
import type { GitFailureCode, GitRepoStatus, GitResult } from "@desktop-shared/git";

/**
 * Root selection + repository state for the git panel.
 *
 * Roots come from roots.json through the desktop bridge (the allow-list main
 * enforces); linked projects supply the preferred default. `applyResult` is the
 * pure reducer, exported for tests.
 */

const LAST_ROOT_KEY = "masarflow.git.lastRoot";

export interface GitRepoError {
  code: GitFailureCode;
  detail: string;
  op: string;
}

export interface GitRepoState {
  root: string | null;
  /** From status.head (a branch name, or "HEAD" when detached). */
  branch: string | null;
  detached: boolean;
  loading: boolean;
  error: GitRepoError | null;
  status: GitRepoStatus | null;
}

export function initialGitRepoState(): GitRepoState {
  return { root: null, branch: null, detached: false, loading: true, error: null, status: null };
}

/** Pure reducer: a failed result keeps the last good data and records the code. */
export function applyResult(
  state: GitRepoState,
  result: GitResult<unknown>,
  op: string,
): GitRepoState {
  if (result.ok) {
    const patch =
      op === "status" && result.data && typeof result.data === "object"
        ? (result.data as GitRepoStatus)
        : null;
    return {
      ...state,
      ...(patch ? { status: patch, branch: patch.head || null, detached: patch.detached } : {}),
      error: null,
    };
  }
  return { ...state, error: { code: result.code, detail: result.message, op } };
}

export function useGitRepo() {
  const projectId = useActiveProjectId();
  const bridge = useMemo(() => gitBridge(), []);
  /* The roots allow-list and the folder picker live on the desktop API, not on
     the git surface (desktop/src/shared/api.ts). */
  const desktop = useMemo(() => getDesktop(), []);
  const [state, setState] = useState<GitRepoState>(initialGitRepoState);
  const [roots, setRoots] = useState<string[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!bridge || !state.root) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const result = await bridge.status(state.root);
    if (!mounted.current) return;
    setState((s) => ({ ...applyResult(s, result, "status"), loading: false }));
  }, [bridge, state.root]);

  /* Choose a root once the allow-list and the project's linked folders are known. */
  useEffect(() => {
    if (!bridge || !projectId) return;
    let cancelled = false;
    void (async () => {
      const [listed, linked] = await Promise.all([
        desktop ? desktop.roots.list() : Promise.resolve<string[]>([]),
        linkedProjectsRepo.listByProject(projectId),
      ]);
      if (cancelled || !mounted.current) return;
      // P2's roots.list() returns the path strings themselves (not {name,path}).
      const allowed = listed.filter((r): r is string => typeof r === "string");
      const stored = typeof window === "undefined" ? null : window.localStorage.getItem(LAST_ROOT_KEY);
      const next = pickDefaultRoot(linked.map((l) => l.rootPath), allowed, stored);
      setRoots(allowed);
      setState((s) => ({ ...s, root: s.root ?? next, loading: next !== null }));
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, desktop, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectRoot = useCallback((root: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(LAST_ROOT_KEY, root);
    setState((s) => ({ ...s, root, status: null, error: null, loading: true }));
  }, []);

  const pickRoot = useCallback(async () => {
    if (!desktop) return;
    const picked = await desktop.dialog.chooseFolder(state.root ?? undefined);
    if (typeof picked === "string" && picked) selectRoot(picked);
  }, [desktop, selectRoot, state.root]);

  /** Run a mutation then re-read the status (stage/unstage/commit/branch all end here). */
  const mutate = useCallback(
    async <T,>(fn: () => Promise<GitResult<T>>, op: string): Promise<GitResult<T>> => {
      const result = await fn();
      if (!mounted.current) return result;
      setState((s) => applyResult(s, result, op));
      await refresh();
      return result;
    },
    [refresh],
  );

  const loadDiff = useCallback(
    async (options: { path: string; staged?: boolean; untracked?: boolean }) => {
      if (!bridge || !state.root) return null;
      const result = await bridge.diff(state.root, options);
      if (!mounted.current) return null;
      setState((s) => (result.ok ? { ...s, error: null } : applyResult(s, result, "status")));
      return result.ok ? result.data : null;
    },
    [bridge, state.root],
  );

  return { ...state, roots, refresh, selectRoot, pickRoot, mutate, loadDiff, bridge, projectId };
}

export type GitRepo = ReturnType<typeof useGitRepo>;
