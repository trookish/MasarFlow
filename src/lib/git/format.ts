import type { GitDiffFile, GitFileChange, GitFailureCode, GitRepoStatus, GitStatusLetter } from "@desktop-shared/git";
import { GIT_DESKTOP_REQUIRED } from "@/lib/git/client";

/**
 * Pure presentation helpers for the git panel. No React, no Dexie, no Electron
 * — everything here is unit-tested without a DOM (see format.test.ts).
 */

export interface StatusBadge {
  short: string;
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
}

const LABELS: Record<GitStatusLetter, StatusBadge> = {
  ".": { short: "", label: "Unchanged", tone: "muted" },
  M: { short: "M", label: "Modified", tone: "warn" },
  T: { short: "T", label: "Type changed", tone: "warn" },
  A: { short: "A", label: "Added", tone: "ok" },
  D: { short: "D", label: "Deleted", tone: "danger" },
  R: { short: "R", label: "Renamed", tone: "warn" },
  C: { short: "C", label: "Copied", tone: "muted" },
  U: { short: "U", label: "Conflict", tone: "danger" },
  "?": { short: "?", label: "Untracked", tone: "muted" },
};

export function statusLabel(letter: GitStatusLetter): StatusBadge {
  return LABELS[letter] ?? LABELS["."];
}

export interface ChangeGroups {
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: GitFileChange[];
}

export function groupChanges(status: GitRepoStatus): ChangeGroups {
  return {
    staged: status.staged,
    unstaged: status.unstaged,
    untracked: status.untracked,
    conflicted: status.conflicted,
  };
}

/** "1 staged · 1 modified · 2 untracked", or "Clean". */
export function summarizeCounts(status: GitRepoStatus): string {
  if (
    status.staged.length === 0 && status.unstaged.length === 0 &&
    status.untracked.length === 0 && status.conflicted.length === 0
  ) {
    return "Clean";
  }
  const parts: string[] = [];
  if (status.conflicted.length) parts.push(`${status.conflicted.length} conflicted`);
  if (status.staged.length) parts.push(`${status.staged.length} staged`);
  if (status.unstaged.length) parts.push(`${status.unstaged.length} modified`);
  if (status.untracked.length) parts.push(`${status.untracked.length} untracked`);
  return parts.join(" · ");
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Accepts epoch ms or an ISO string (%aI). Falls back to a plain date, then "". */
export function relativeDate(input: string | number, nowMs: number = Date.now()): string {
  const ms = typeof input === "number" ? input : Date.parse(input);
  if (!Number.isFinite(ms)) return "";
  const diff = nowMs - ms;
  if (diff < 0) return new Date(ms).toISOString().slice(0, 10);
  if (diff < 45_000) return "just now";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(diff / 3_600_000);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(diff / 86_400_000);
  if (days <= 14) return `${days} d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Blocking (empty) or advisory (over-long subject) message problems. */
export function commitProblem(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return "Write a commit message first.";
  const subject = trimmed.split(/\r?\n/)[0];
  if (subject.length > 72) {
    return `The subject is ${subject.length} characters — keep the first line under 50 characters and put the rest in the body.`;
  }
  return null;
}

/**
 * Client-side mirror of git's ref rules for instant feedback. The authoritative
 * check is `git check-ref-format --branch` in the main process (P6.T5) — if the
 * two ever disagree, git wins and its refusal is what the user sees.
 */
export function branchNameProblem(name: string): string | null {
  const value = name.trim();
  if (!value) return "Enter a branch name.";
  if (value === "@") return "'@' is a reserved name.";
  if (value.startsWith("-")) return "A branch name cannot start with '-'.";
  if (value.startsWith("/") || value.endsWith("/")) return "A branch name cannot start or end with '/'.";
  if (value.endsWith(".lock")) return "A branch name cannot end with '.lock'.";
  const bad = /[\s~^:?*\[\\\x00-\x1f\x7f]/.test(value);
  if (bad) return "Branch names cannot contain spaces or any of ~ ^ : ? * [ \\ or control characters.";
  if (value.includes("..")) return "A branch name cannot contain '..'.";
  if (value.includes("@{")) return "A branch name cannot contain '@{'.";
  if (/\/\//.test(value) || /\/\./.test(value) || /\.\.$/.test(value)) {
    return "A branch name cannot contain '//', '/.', or end with '.'.";
  }
  return null;
}

const normPath = (p: string): string =>
  p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

const isInside = (root: string, allowed: string[]): boolean => {
  const r = normPath(root);
  return allowed.some((a) => {
    const n = normPath(a);
    return n.length > 0 && (r === n || r.startsWith(`${n}/`));
  });
};

/**
 * Which repository root the panel should preselect: the remembered one when it
 * is still allowed, else the first linked folder that is inside an allowed
 * root, else the first allowed root. Advisory only — main re-checks every call.
 */
export function pickDefaultRoot(
  candidates: string[],
  allowed: string[],
  lastUsed: string | null,
): string | null {
  if (lastUsed && isInside(lastUsed, allowed)) return lastUsed;
  const linked = candidates.find((c) => isInside(c, allowed));
  if (linked) return linked;
  return allowed.length ? allowed[0] : null;
}

/** Colour class category for one line of a unified diff hunk. */
export function diffLineTone(line: string): "added" | "removed" | "context" | "meta" {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) return "meta";
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  if (line.startsWith("\\")) return "meta";
  return "context";
}

/** "3 files · +12 −4" — the compact stat line. */
export function diffStatSummary(files: GitDiffFile[]): string {
  if (!files.length) return "No changes";
  const additions = files.reduce((n, f) => n + f.additions, 0);
  const deletions = files.reduce((n, f) => n + f.deletions, 0);
  return `${files.length} file${files.length === 1 ? "" : "s"} · +${additions} −${deletions}`;
}

export type GitStateAction = "init" | "retry" | "install" | "create-branch" | "open-linked-projects" | null;

export type GitPanelState =
  | { kind: "no-desktop" }
  | { kind: "detached" }
  | { kind: "failure"; code: GitFailureCode; detail?: string };

export interface GitStateCopy {
  title: string;
  body: string;
  action: GitStateAction;
  detail?: string;
}

/**
 * One place that turns any non-happy git state into copy plus (at most) one
 * recovery action, so the panel never shows a raw todo of failure strings.
 */
export function describeGitState(state: GitPanelState): GitStateCopy {
  if (state.kind === "no-desktop") {
    return {
      title: "Git needs the desktop app",
      body: GIT_DESKTOP_REQUIRED,
      action: null,
    };
  }
  if (state.kind === "detached") {
    return {
      title: "Detached HEAD",
      body: "No branch is checked out, so a commit here would be easy to lose. Create a branch from the current commit and continue there.",
      action: "create-branch",
    };
  }
  const detail = state.detail?.trim() || undefined;
  switch (state.code) {
    case "git-missing":
      return {
        title: "Git was not found",
        body: "MasarFlow runs git itself but could not start it. Install Git for Windows and reopen the app, or point MASARFLOW_GIT_PATH at a portable git.exe.",
        action: "install",
        detail,
      };
    case "not-a-repo":
      return {
        title: "Not a git repository",
        body: "This folder has no .git yet. Create a repository to start tracking changes here — nothing else in the app is affected.",
        action: "init",
        detail,
      };
    case "root-not-allowed":
      return {
        title: "Folder not linked",
        body: "Git only runs inside folders you added to this app. Link this folder in Linked Projects, then retry.",
        action: "open-linked-projects",
        detail,
      };
    case "permission-denied":
      return {
        title: "Windows denied access",
        body: "Another program is holding files in this folder (an editor, an indexer, a terminal). Close it and retry.",
        action: "retry",
        detail,
      };
    case "index-locked":
      return {
        title: "Repository is busy",
        body: "A git process is writing to this repository right now. Wait a moment and retry.",
        action: "retry",
        detail,
      };
    case "nothing-to-commit":
      return {
        title: "Nothing to commit",
        body: "Nothing is staged. Tick the files you want in this commit, then commit again.",
        action: null,
        detail,
      };
    case "invalid-input":
      return {
        title: "Git rejected that input",
        body: "The branch name or path is not valid for git. Fix it and retry.",
        action: null,
        detail,
      };
    case "no-remote":
      return {
        title: "No origin remote",
        body: "This repository has no 'origin' remote, so there is nothing to fetch or compare against. Local commits still work.",
        action: null,
        detail,
      };
    case "detached-head":
      return {
        title: "Detached HEAD",
        body: "Create or switch to a branch before committing.",
        action: "create-branch",
        detail,
      };
    case "timeout":
      return {
        title: "Git timed out",
        body: "The command did not finish within a minute and was stopped. Large repositories can be slow on first read — retry.",
        action: "retry",
        detail,
      };
    default:
      return {
        title: "Git failed",
        body: "The command did not succeed. The raw output below usually names the file or ref that caused it.",
        action: "retry",
        detail,
      };
  }
}
