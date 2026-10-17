"use client";

/**
 * Repository card. P6 owns git end to end (main-process `execFile`, the root
 * allow-list, the porcelain-v2 parser, the hook); this card only decides how to
 * say it. The hook exposes loading / error / status separately, so all four
 * states are honest — reading, desktop unavailable or no repository, a read
 * failure, and a real status. Nothing here runs git, and nothing here invents
 * a second status source.
 */

import { GitBranch, GitCommitHorizontal, RefreshCw, TriangleAlert } from "lucide-react";
import { useGitRepo } from "@/lib/git/use-git-repo";
import { Button } from "@/components/ui/button";

export function TodayGit() {
  const repo = useGitRepo();

  const changed =
    repo.status === null
      ? 0
      : repo.status.staged.length + repo.status.unstaged.length + repo.status.untracked.length;
  const noCommits = repo.status !== null && /^0+$/.test(repo.status.oid);

  return (
    <section aria-label="Repository" className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Repository</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Re-read the repository status"
          title="Refresh"
          onClick={() => void repo.refresh()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </header>

      {repo.loading && repo.status === null ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Reading the repository…</p>
      ) : repo.error !== null ? (
        <p className="flex items-start gap-2 px-3 py-4 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Git could not be read ({repo.error.code}). Open the Git panel for the full message.
          </span>
        </p>
      ) : repo.status === null || repo.root === null ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No Git repository is linked to this project. Link the folder that contains it in{" "}
          <span className="font-medium">Chat → Linked folders</span>.
        </p>
      ) : (
        <div className="space-y-2 px-3 py-3 text-xs">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{repo.status.head}</span>
            {repo.status.upstream === null ? (
              <span className="text-muted-foreground">no upstream</span>
            ) : null}
            {repo.status.ahead > 0 ? (
              <span className="text-muted-foreground">{repo.status.ahead} to push</span>
            ) : null}
            {repo.status.behind > 0 ? (
              <span className="text-muted-foreground">{repo.status.behind} to pull</span>
            ) : null}
            {repo.status.conflicted.length > 0 ? (
              <span className="text-destructive">
                {repo.status.conflicted.length} conflicted
              </span>
            ) : changed > 0 ? (
              <span className="text-amber-500">{changed} uncommitted</span>
            ) : (
              <span className="text-emerald-500">clean</span>
            )}
          </p>
          {repo.status.conflicted.length > 0 ? (
            <p className="text-destructive">Resolve the conflicts before continuing.</p>
          ) : null}
          <p className="flex items-start gap-2 text-muted-foreground">
            <GitCommitHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground">
                {noCommits ? "No commits yet" : `HEAD ${repo.status.oid.slice(0, 8)}`}
              </span>
              <span className="block">
                {repo.status.detached ? "detached HEAD" : `on ${repo.status.head}`}
              </span>
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
