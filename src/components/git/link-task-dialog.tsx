"use client";

import type { GitCommitInfo } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";

/**
 * Placeholder for the P6.T13 "link commit to task" dialog (it lands with
 * `@/lib/git/link-commit`). Typed stub only — keeps `pnpm typecheck`
 * green so the commit log can ship first.
 */
export function LinkTaskDialog(props: {
  repo: GitRepo;
  commit: GitCommitInfo | null;
  onClose: () => void;
  onLinked: () => Promise<void>;
}) {
  void props;
  return null;
}
