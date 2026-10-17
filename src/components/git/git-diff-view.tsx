"use client";

import type { GitRepo } from "@/lib/git/use-git-repo";

/**
 * P6.T10 placeholder: the unified-diff viewer lands in P6.T11.
 * Typed stub only — keeps `pnpm typecheck` green in the meantime.
 */
export function GitDiffView(_props: {
  repo: GitRepo;
  target: { path: string; staged: boolean; untracked?: boolean };
  onClose: () => void;
}) {
  return null;
}
