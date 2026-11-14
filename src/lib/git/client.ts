import { getDesktop } from "@/lib/desktop/bridge";
import type { MasarflowApi } from "@desktop-shared/api";
import type { GitFailureCode } from "@desktop-shared/git";

/**
 * Thin renderer-side wrapper around the preload git surface.
 *
 * `window.masarflow` is missing during SSR and if the preload failed to load,
 * so every git UI must handle `null` — that is the "desktop required" panel,
 * not an error state.
 */

export type GitBridge = NonNullable<MasarflowApi["git"]>;

export const GIT_DESKTOP_REQUIRED =
  "Git is unavailable because the MasarFlow desktop bridge did not load. Restart MasarFlow; if this persists, use Copy diagnostics in Control Center.";

/** The git surface of the desktop bridge, or null when the bridge is missing. */
export function gitBridge(): GitBridge | null {
  const desktop = getDesktop() as (MasarflowApi & { git?: GitBridge }) | null;
  return desktop?.git ?? null;
}

/** User-facing copy per failure code. Typed as a full Record so a new code cannot be forgotten. */
export const GIT_FAILURE_COPY: Record<GitFailureCode, string> = {
  "git-missing":
    "Git was not found. Install Git for Windows, then reopen MasarFlow. (A portable build can be pointed at with MASARFLOW_GIT_PATH.)",
  "not-a-repo": "This folder is not a git repository yet.",
  "root-not-allowed": "That folder is not one of this project's linked folders — add it from Linked Projects first.",
  "permission-denied": "Windows denied access to files in this folder. Close whatever is holding them (editor, indexer) and retry.",
  "index-locked": "Another git process is writing to this repository. Wait a second and retry.",
  "nothing-to-commit": "Nothing is staged. Tick the files you want in this commit first.",
  "invalid-input": "Git rejected that name or path.",
  "no-remote": "This repository has no 'origin' remote.",
  "detached-head": "HEAD is detached. Switch to a branch before committing.",
  timeout: "Git did not finish within a minute and was stopped.",
  unknown: "Git failed.",
};

/** Headline copy plus (optionally) the raw git line as a details suffix. */
export function gitFailureCopy(code: GitFailureCode, detail?: string): string {
  const base = GIT_FAILURE_COPY[code] ?? GIT_FAILURE_COPY.unknown;
  const trimmed = (detail ?? "").trim();
  return trimmed ? `${base} Details: ${trimmed}` : base;
}
