import type { GitRepoStatus } from "@desktop-shared/git";

/**
 * One line of repository truth for the chat context. Pure: it formats a brief
 * the caller already assembled, so it is testable without Electron and without
 * IndexedDB. The chat may read the repository; it may not write to it (D-P6-7).
 */

export interface RepoBrief {
  root: string;
  head: string;
  detached: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  conflicted: number;
  remoteUrl: string | null;
  lastCommit: { shortSha: string; subject: string; date: string } | null;
}

export function briefFromStatus(
  root: string,
  status: GitRepoStatus,
  remoteUrl: string | null,
  lastCommit: RepoBrief["lastCommit"],
): RepoBrief {
  return {
    root,
    head: status.head,
    detached: status.detached,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged.length,
    modified: status.unstaged.length,
    untracked: status.untracked.length,
    conflicted: status.conflicted.length,
    remoteUrl,
    lastCommit,
  };
}

export function formatRepoLine(brief: RepoBrief): string {
  const where = brief.detached ? "detached HEAD" : `on ${brief.head || "an unnamed branch"}`;
  const parts: string[] = [`${brief.root} ${where}`];

  if (brief.upstream) {
    if (brief.ahead === 0 && brief.behind === 0 && brief.remoteUrl) {
      parts.push(`up to date with ${brief.upstream}`);
    } else {
      const divergence = [
        brief.ahead ? `${brief.ahead} ahead` : "",
        brief.behind ? `${brief.behind} behind` : "",
      ].filter(Boolean);
      parts.push(divergence.length ? `${divergence.join(", ")} of ${brief.upstream}` : `tracking ${brief.upstream}`);
    }
  } else if (brief.detached) {
    parts.push("no branch checked out");
  } else if (!brief.remoteUrl) {
    parts.push("no origin remote");
  } else {
    parts.push("no upstream branch");
  }

  const dirty = [
    brief.conflicted ? `${brief.conflicted} conflicted` : "",
    brief.staged ? `${brief.staged} staged` : "",
    brief.modified ? `${brief.modified} modified` : "",
    brief.untracked ? `${brief.untracked} untracked` : "",
  ].filter(Boolean);
  parts.push(dirty.length ? dirty.join(", ") : "working tree clean");

  parts.push(
    brief.lastCommit
      ? `last commit ${brief.lastCommit.shortSha} "${brief.lastCommit.subject}" (${brief.lastCommit.date})`
      : "no commits yet",
  );
  return parts.join(" — ");
}
