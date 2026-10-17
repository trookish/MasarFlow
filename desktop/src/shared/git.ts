/**
 * Git types shared by the main process (producer) and the renderer (consumer).
 * Pure TypeScript — no Electron, no node:child_process, no React (imported by
 * both `@shared/git` in the Electron build and `@desktop-shared/git` in tests
 * and in the Next app).
 */

export type GitStatusLetter =
  | "." | "M" | "T" | "A" | "D" | "R" | "C" | "U" | "?";

export interface GitFileChange {
  /** Repo-root-relative path (forward slashes, raw UTF-8). */
  path: string;
  /** Previous path for a rename/copy, else null. */
  origPath: string | null;
  /** One-letter index (staged) status; "." = unchanged. */
  index: GitStatusLetter;
  /** One-letter worktree (unstaged) status; "." = unchanged. */
  worktree: GitStatusLetter;
  /** Unmerged (conflict) entry, from a `u` record. */
  conflicted: boolean;
}

export interface GitRepoStatus {
  /** Current branch name, or "HEAD" when detached (matches `git rev-parse --abbrev-ref HEAD`). */
  head: string;
  detached: boolean;
  /** Full HEAD commit id, or the all-zero id before the first commit. */
  oid: string;
  /** e.g. "origin/main", or null when the branch has no upstream. */
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: GitFileChange[];
}

export interface GitBranchInfo {
  name: string;
  oid: string;
  head: boolean;
  upstream: string;
}

export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  /** ISO-8601 author date as git prints it (%aI), e.g. "2026-10-16T23:46:00+03:00". */
  date: string;
  committer: string;
  /** Space-separated parent ids. */
  parents: string[];
  subject: string;
  body: string;
}

export interface GitDiffHunk {
  /** The raw "@@ -a,b +c,d @@ section" line. */
  header: string;
  /** Body lines including their leading ' ', '+', '-' or '\'. */
  lines: string[];
}

export interface GitDiffFile {
  path: string;
  origPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "binary";
  binary: boolean;
  additions: number;
  deletions: number;
  /** True when the old side is /dev/null (new file, incl. untracked via --no-index). */
  isNew: boolean;
  hunks: GitDiffHunk[];
}

export interface GitNumstatEntry {
  path: string;
  origPath: string | null;
  additions: number;
  deletions: number;
  binary: boolean;
}

export type GitFailureCode =
  | "git-missing"
  | "not-a-repo"
  | "root-not-allowed"
  | "permission-denied"
  | "index-locked"
  | "nothing-to-commit"
  | "invalid-input"
  | "no-remote"
  | "detached-head"
  | "timeout"
  | "unknown";

export interface GitOk<T> {
  ok: true;
  data: T;
}

export interface GitErr {
  ok: false;
  code: GitFailureCode;
  /** Last non-empty stderr line, trimmed to 300 chars — for the "details" line, not for the headline. */
  message: string;
}

export type GitResult<T> = GitOk<T> | GitErr;
