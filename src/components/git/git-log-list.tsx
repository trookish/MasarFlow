"use client";

import { useCallback, useEffect, useState } from "react";
import { History, GitCommitHorizontal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { relativeDate, shortSha } from "@/lib/git/format";
import type { GitCommitInfo } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";
import { LinkTaskDialog } from "@/components/git/link-task-dialog";

export function GitLogList({ repo }: { repo: GitRepo }) {
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [linking, setLinking] = useState<GitCommitInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repo.bridge || !repo.root) return;
    const result = await repo.bridge.log(repo.root, { limit: 50 });
    if (result.ok) {
      setCommits(result.data);
      setError(null);
    } else {
      setError(result.message || result.code);
    }
  }, [repo.bridge, repo.root]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial log load
    void load();
  }, [load, repo.branch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border pb-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">History</h2>
        <span className="text-xs text-muted-foreground">{commits.length} of the last 50</span>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {error ? <p className="py-2 text-xs text-red-600">{error}</p> : null}
        <ul>
          {commits.map((commit) => (
            <li key={commit.sha} className="border-b border-border/60 py-1.5">
              <button
                type="button"
                className="flex w-full items-start gap-2 text-left"
                onClick={() => setExpanded(expanded === commit.sha ? null : commit.sha)}
              >
                <GitCommitHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{commit.subject}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    <span className="font-mono">{shortSha(commit.sha)}</span> · {commit.author} ·{" "}
                    {relativeDate(commit.date)}
                  </span>
                </span>
                {commit.parents.length > 1 ? <Badge variant="outline">merge</Badge> : null}
              </button>
              {expanded === commit.sha ? (
                <div className="mt-2 space-y-2 pl-6">
                  {commit.body ? (
                    <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">{commit.body}</pre>
                  ) : null}
                  <p className="font-mono text-[11px] text-muted-foreground">{commit.sha}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-[11px] text-primary underline-offset-2 hover:underline"
                      onClick={() => setLinking(commit)}
                    >
                      Link to task…
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {!commits.length && !error ? (
          <p className="py-2 text-xs text-muted-foreground">No commits yet.</p>
        ) : null}
      </ScrollArea>

      <LinkTaskDialog
        repo={repo}
        commit={linking}
        onClose={() => setLinking(null)}
        onLinked={async () => {
          await repo.refresh();
        }}
      />
    </div>
  );
}
