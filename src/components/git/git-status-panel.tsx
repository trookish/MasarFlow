"use client";

import { useState } from "react";
import { FileQuestion, FilePlus2, GitCommitHorizontal, Plus, Minus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { gitFailureCopy } from "@/lib/git/client";
import { groupChanges, statusLabel, summarizeCounts } from "@/lib/git/format";
import type { GitFileChange } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";
import { GitDiffView } from "@/components/git/git-diff-view";
import { GitCommitBox } from "@/components/git/git-commit-box";
import { GitBranchMenu } from "@/components/git/git-branch-menu";
import { GitLogList } from "@/components/git/git-log-list";
import { GithubSection } from "@/components/git/github-section";

const tone: Record<string, string> = {
  warn: "border-amber-500/50 text-amber-600",
  danger: "border-red-500/50 text-red-600",
  ok: "border-emerald-500/50 text-emerald-600",
  muted: "border-border text-muted-foreground",
};

export function GitStatusPanel({ repo }: { repo: GitRepo }) {
  const [selected, setSelected] = useState<{ path: string; staged: boolean; untracked?: boolean } | null>(null);
  const status = repo.status;

  const stage = async (paths: string[]) => {
    if (!repo.bridge || !repo.root) return;
    await repo.mutate(() => repo.bridge!.stage(repo.root!, paths), "stage");
  };
  const unstage = async (paths: string[]) => {
    if (!repo.bridge || !repo.root) return;
    await repo.mutate(() => repo.bridge!.unstage(repo.root!, paths), "unstage");
  };

  if (repo.error?.code === "not-a-repo") {
    return (
      <div className="flex flex-col items-start gap-2 rounded border border-border p-4">
        <p className="text-sm text-muted-foreground">
          {repo.root} is not a git repository yet.
        </p>
        <Button
          size="sm"
          onClick={() => repo.mutate(() => repo.bridge!.init(repo.root!), "init")}
        >
          <GitCommitHorizontal className="h-4 w-4" /> Create a repository here
        </Button>
      </div>
    );
  }

  if (!repo.root) {
    return (
      <div className="flex flex-col items-start gap-3 rounded border border-border p-4">
        <p className="text-sm text-muted-foreground">
          No linked folder is available for git. Link a folder to this project, or pick one now
          (it is added to the app's allow-list).
        </p>
        <Button size="sm" onClick={() => void repo.pickRoot()}>
          <FolderOpen className="h-4 w-4" /> Choose a folder…
        </Button>
      </div>
    );
  }

  if (!status) {
    return <p className="p-4 text-sm text-muted-foreground">Reading repository…</p>;
  }

  const groups = groupChanges(status);

  const row = (change: GitFileChange, staged: boolean) => {
    const badge = statusLabel(staged ? change.index : change.worktree);
    return (
      <li key={`${staged ? "s" : "u"}:${change.path}`} className="flex items-center gap-2 py-0.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setSelected({ path: change.path, staged })}
        >
          <Badge variant="outline" className={tone[badge.tone]}>{badge.short || "·"}</Badge>
          <span className="truncate font-mono text-xs">{change.path}</span>
          {change.origPath ? (
            <span className="truncate text-xs text-muted-foreground">← {change.origPath}</span>
          ) : null}
        </button>
        {staged ? (
          <Button size="sm" variant="ghost" title="Unstage" onClick={() => void unstage([change.path])}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" title="Stage" onClick={() => void stage([change.path])}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </li>
    );
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex min-h-0 flex-col gap-3 rounded border border-border p-3">
        <div className="flex items-center gap-2">
          <GitBranchPlaceholder repo={repo} />
          <span className="text-xs text-muted-foreground">{summarizeCounts(status)}</span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => void repo.pickRoot()}
          >
            <FolderOpen className="h-3.5 w-3.5" /> Folder
          </Button>
        </div>
        {repo.error ? (
          <p className="rounded border border-red-500/40 bg-red-500/5 p-2 text-xs text-red-600">
            {gitFailureCopy(repo.error.code, repo.error.detail)}
          </p>
        ) : null}
        <ScrollArea className="min-h-0 flex-1">
          {groups.conflicted.length ? (
            <section>
              <h3 className="text-xs font-semibold uppercase text-red-600">Conflicts</h3>
              <ul>{groups.conflicted.map((c) => row(c, false))}</ul>
            </section>
          ) : null}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Staged ({groups.staged.length})
              </h3>
              {groups.staged.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void unstage(groups.staged.map((c) => c.path))}
                >
                  Unstage all
                </Button>
              ) : null}
            </div>
            <ul>{groups.staged.map((c) => row(c, true))}</ul>
          </section>
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Changes ({groups.unstaged.length})
              </h3>
              {groups.unstaged.length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void stage(groups.unstaged.map((c) => c.path))}
                >
                  Stage all
                </Button>
              ) : null}
            </div>
            <ul>{groups.unstaged.map((c) => row(c, false))}</ul>
          </section>
          {groups.untracked.length ? (
            <section>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                  <FileQuestion className="h-3 w-3" /> Untracked ({groups.untracked.length})
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void stage(groups.untracked)}
                >
                  <FilePlus2 className="h-3 w-3" /> Stage all
                </Button>
              </div>
              <ul>
                {groups.untracked.map((path) => (
                  <li key={`u:${path}`} className="flex items-center gap-2 py-0.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-mono text-xs"
                      onClick={() => setSelected({ path, staged: false, untracked: true })}
                    >
                      {path}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Stage"
                      onClick={() => void stage([path])}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {summarizeCounts(status) === "Clean" ? (
            <p className="py-2 text-xs text-muted-foreground">Working tree clean.</p>
          ) : null}
        </ScrollArea>
        <GitCommitBox repo={repo} stagedCount={groups.staged.length} />
      </div>

      <div className="flex min-h-0 flex-col gap-3 rounded border border-border p-3">
        {selected ? (
          <GitDiffView
            repo={repo}
            target={selected}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <GitLogList repo={repo} />
            <GithubSection repo={repo} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Small wrapper so the branch menu stays in its own file (T12). */
function GitBranchPlaceholder({ repo }: { repo: GitRepo }) {
  return <GitBranchMenu repo={repo} />;
}
