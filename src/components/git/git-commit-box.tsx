"use client";

import { useState } from "react";
import { GitCommitHorizontal, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { gitFailureCopy } from "@/lib/git/client";
import { commitProblem, shortSha } from "@/lib/git/format";
import type { GitRepo } from "@/lib/git/use-git-repo";

export function GitCommitBox({ repo, stagedCount }: { repo: GitRepo; stagedCount: number }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ sha: string; commitId: string } | null>(null);

  const submit = async () => {
    const invalid = commitProblem(message);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    if (!repo.bridge || !repo.root) return;
    setProblem(null);
    setBusy(true);
    try {
      const result = await repo.mutate(() => repo.bridge!.commit(repo.root!, { message }), "commit");
      if (!result.ok) {
        setProblem(gitFailureCopy(result.code, result.message));
        return;
      }
      // P6.T13 replaces this with recordLocalCommit() so the commit is mirrored
      // into Dexie and the task/commit graph sees it (P5 fabric).
      setCommitted({ sha: result.data.sha, commitId: "" });
      setMessage("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={"feat(scope): summary\n\nWhy, not what."}
        rows={3}
        className="font-mono text-xs"
      />
      {problem ? <p className="text-xs text-red-600">{problem}</p> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy || stagedCount === 0} onClick={() => void submit()}>
          <GitCommitHorizontal className="h-4 w-4" />
          {busy ? "Committing…" : `Commit ${stagedCount} file${stagedCount === 1 ? "" : "s"}`}
        </Button>
        {stagedCount === 0 ? (
          <span className="text-xs text-muted-foreground">Stage something first.</span>
        ) : null}
        {committed ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link2 className="h-3 w-3" />
            committed {shortSha(committed.sha)} — link it to a task from the log
          </span>
        ) : null}
      </div>
    </div>
  );
}
