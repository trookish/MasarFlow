"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EntityChip } from "@/components/entities/entity-chip";
import { tasksRepo } from "@/lib/db/repos/tasks";
import { linkCommitToTask, recordLocalCommit, suggestTasksForMessage, unlinkCommitFromTask } from "@/lib/git/link-commit";
import { shortSha } from "@/lib/git/format";
import type { Task } from "@/lib/db/schema";
import type { GitCommitInfo } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";

/**
 * "Link commit to task". The commit row is created here if it is not in Dexie
 * yet (a commit made before this panel existed, or one pulled from GitHub), so
 * the action works from the log for any commit, not only ones made in the app.
 */
export function LinkTaskDialog({
  repo,
  commit,
  onClose,
  onLinked,
}: {
  repo: GitRepo;
  commit: GitCommitInfo | null;
  onClose: () => void;
  onLinked: () => Promise<void>;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const [linkedCommitId, setLinkedCommitId] = useState<string | null>(null);
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([]);

  useEffect(() => {
    if (!commit || !repo.projectId) return;
    let cancelled = false;
    void (async () => {
      const [rows, ids] = await Promise.all([
        tasksRepo.listByProject(repo.projectId),
        suggestTasksForMessage(repo.projectId, commit.body ? `${commit.subject}\n${commit.body}` : commit.subject),
      ]);
      if (!cancelled) {
        setTasks(rows);
        setSuggested(ids);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commit, repo.projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks.slice(0, 50);
    return tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 50);
  }, [tasks, query]);

  if (!commit) return null;

  const ensureCommitRow = async (): Promise<string | null> => {
    if (linkedCommitId) return linkedCommitId;
    const { commit: row } = await recordLocalCommit({
      projectId: repo.projectId,
      root: repo.root ?? "",
      sha: commit.sha,
      message: commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject,
      author: commit.author,
      date: commit.date,
    });
    setLinkedCommitId(row.id);
    setLinkedTaskIds(row.linkedTaskIds);
    return row.id;
  };

  const link = async (taskId: string) => {
    const commitId = await ensureCommitRow();
    if (!commitId || !repo.projectId) return;
    await linkCommitToTask({ projectId: repo.projectId, commitId, taskId });
    setLinkedTaskIds((ids) => (ids.includes(taskId) ? ids : [...ids, taskId]));
    await onLinked();
  };

  const unlink = async (taskId: string) => {
    const commitId = await ensureCommitRow();
    if (!commitId) return;
    await unlinkCommitFromTask({ commitId, taskId });
    setLinkedTaskIds((ids) => ids.filter((id) => id !== taskId));
    await onLinked();
  };

  return (
    <div className="rounded border border-border p-3">
      <header className="flex items-center gap-2 pb-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Link commit</span>
        <span className="font-mono text-xs text-muted-foreground">{shortSha(commit.sha)}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className="flex items-center gap-2 pb-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter tasks…"
          className="h-7 text-xs"
        />
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {filtered.map((task) => {
          const isLinked = linkedTaskIds.includes(task.id);
          return (
            <li key={task.id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
              {suggested.includes(task.id) && !isLinked ? (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                  suggested
                </Badge>
              ) : null}
              {isLinked ? (
                <>
                  <EntityChip entity={{ kind: "task", id: task.id }} />
                  <Button size="sm" variant="ghost" onClick={() => void unlink(task.id)}>
                    Unlink
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void link(task.id)}>
                  Link
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {!filtered.length ? <p className="text-xs text-muted-foreground">No matching tasks.</p> : null}
    </div>
  );
}
