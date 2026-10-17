"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { diffLineTone, statusLabel } from "@/lib/git/format";
import type { GitDiffFile } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";

const lineClass: Record<ReturnType<typeof diffLineTone>, string> = {
  added: "bg-emerald-500/10 text-emerald-700",
  removed: "bg-red-500/10 text-red-700",
  context: "",
  meta: "bg-muted/50 text-muted-foreground",
};

function DiffFile({ file }: { file: GitDiffFile }) {
  const badge = statusLabel(
    file.status === "added" ? "A" : file.status === "deleted" ? "D"
      : file.status === "renamed" ? "R" : file.status === "copied" ? "C" : "M",
  );
  return (
    <section className="mb-4">
      <header className="flex items-center gap-2 border-b border-border pb-1">
        <Badge variant="outline">{badge.label}</Badge>
        <span className="truncate font-mono text-xs">{file.path}</span>
        {file.origPath ? <span className="text-xs text-muted-foreground">← {file.origPath}</span> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {file.binary ? "binary" : `+${file.additions} −${file.deletions}`}
        </span>
      </header>
      {file.binary ? (
        <p className="py-2 text-xs text-muted-foreground">Binary file — no textual diff.</p>
      ) : (
        <pre className="overflow-x-auto text-xs leading-5">
          <code>
            {file.hunks.map((hunk) => (
              <span key={hunk.header}>
                <span className={`block px-1 ${lineClass.meta}`}>{hunk.header}</span>
                {hunk.lines.map((line, i) => (
                  <span key={`${hunk.header}:${i}`} className={`block px-1 ${lineClass[diffLineTone(line)]}`}>
                    {line}
                  </span>
                ))}
              </span>
            ))}
          </code>
        </pre>
      )}
    </section>
  );
}

export function GitDiffView({
  repo,
  target,
  onClose,
}: {
  repo: GitRepo;
  target: { path: string; staged: boolean; untracked?: boolean };
  onClose: () => void;
}) {
  const [files, setFiles] = useState<GitDiffFile[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while the new diff loads
    setFiles(null);
    setFailed(null);
    void (async () => {
      if (!repo.bridge || !repo.root) return;
      const result = await repo.bridge.diff(repo.root, {
        path: target.path,
        staged: target.staged,
        untracked: target.untracked === true,
      });
      if (cancelled) return;
      if (result.ok) setFiles(result.data);
      else setFailed(result.message || result.code);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.root, target.path, target.staged, target.untracked, repo.branch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border pb-2">
        <span className="truncate font-mono text-xs">{target.path}</span>
        <Badge variant="outline">{target.staged ? "Staged" : "Working tree"}</Badge>
        {target.untracked ? <Badge variant="outline">Untracked</Badge> : null}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1 pt-2">
        {failed ? <p className="text-xs text-red-600">{failed}</p> : null}
        {!failed && files === null ? (
          <p className="text-xs text-muted-foreground">Loading diff…</p>
        ) : null}
        {files && files.length === 0 ? (
          <p className="text-xs text-muted-foreground">No textual changes to show.</p>
        ) : null}
        {files?.map((file) => <DiffFile key={`${file.path}:${file.status}`} file={file} />)}
      </ScrollArea>
    </div>
  );
}
