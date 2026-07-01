"use client";

import { useState } from "react";
import {
  GitCommitHorizontal,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileText,
  Settings2,
} from "lucide-react";
import type { Commit, Spec } from "@/lib/db/schema";
import { useGithub, isGithubConfigured } from "@/lib/stores/github";
import { syncGithubCommits } from "@/lib/github-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * Compact GitHub commits card for the dashboard grid. Real Octokit sync: the
 * PAT lives in localStorage and is only ever sent to the local /api/github
 * proxy. Unconfigured → shows the connection form; configured → shows the
 * latest synced commits with spec links.
 */
export function GithubCommitsCard({
  projectId,
  commits,
  specs,
}: {
  projectId: string | null | undefined;
  commits: Commit[];
  specs: Spec[];
}) {
  const gh = useGithub();
  const configured = isGithubConfigured(gh);
  const [showConfig, setShowConfig] = useState(!configured);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<number | null>(null);
  const specById = new Map(specs.map((s) => [s.id, s]));

  async function sync() {
    if (!projectId || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await syncGithubCommits(projectId, gh);
      setLastAdded(result.added);
      gh.update({ lastSyncedAt: Date.now() });
      setShowConfig(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {configured ? (
          <span className="truncate text-xs text-muted-foreground">
            {gh.owner}/{gh.repo}
            {gh.branch ? `@${gh.branch}` : ""}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not connected</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="GitHub connection settings"
            onClick={() => setShowConfig((v) => !v)}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={sync}
            disabled={!projectId || syncing || !configured}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync
          </Button>
        </div>
      </div>

      {showConfig && (
        <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={gh.owner}
              onChange={(e) => gh.update({ owner: e.target.value })}
              placeholder="Owner (user or org)"
              className="h-8 text-sm"
            />
            <Input
              value={gh.repo}
              onChange={(e) => gh.update({ repo: e.target.value })}
              placeholder="Repository name"
              className="h-8 text-sm"
            />
            <Input
              value={gh.branch}
              onChange={(e) => gh.update({ branch: e.target.value })}
              placeholder="Branch (default)"
              className="h-8 text-sm"
            />
            <Input
              type="password"
              value={gh.pat}
              onChange={(e) => gh.update({ pat: e.target.value })}
              placeholder="Personal access token"
              className="h-8 text-sm"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            The token stays in this browser and is sent only to the local
            Octokit proxy — a fine-grained token with read-only Contents access
            is enough. Commits mentioning RFC numbers or task titles link
            automatically.
          </p>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {lastAdded !== null && !error && (
        <p className="text-xs text-muted-foreground">
          {lastAdded === 0
            ? "Up to date — no new commits."
            : `Imported ${lastAdded} new commit${lastAdded === 1 ? "" : "s"}.`}
        </p>
      )}

      {commits.length === 0 ? (
        !showConfig && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {configured
              ? "No commits synced yet — hit Sync."
              : "Connect a repository to pull real commit history."}
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {commits.slice(0, 5).map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <GitCommitHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{c.message.split("\n")[0]}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                  <code className="rounded bg-accent/60 px-1">
                    {c.sha.slice(0, 7)}
                  </code>
                  <span>{c.author}</span>
                  <span>{new Date(c.date).toLocaleDateString()}</span>
                  {c.linkedSpecIds.map((id) => {
                    const s = specById.get(id);
                    return s ? (
                      <Badge key={id} variant="outline" className="gap-1 px-1.5 py-0 text-[10px]">
                        <FileText className="h-2.5 w-2.5" /> {s.number}
                      </Badge>
                    ) : null;
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
