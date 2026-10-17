"use client";

import { useEffect, useState } from "react";
import { RefreshCw, GitBranch, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { gitBridge } from "@/lib/git/client";
import { describeGitState } from "@/lib/git/format";
import { useGitRepo } from "@/lib/git/use-git-repo";
import { linkedProjectsRepo } from "@/lib/db/repos";
import { LinkedProjectsDialog } from "@/components/chat/linked-projects-dialog";
import type { LinkedProject } from "@/lib/db/schema";
import { GitStatusPanel } from "@/components/git/git-status-panel";

export function GitView() {
  const bridge = gitBridge();
  const repo = useGitRepo();
  const [linkerOpen, setLinkerOpen] = useState(false);
  const [linkedRoots, setLinkedRoots] = useState<LinkedProject[]>([]);

  /* The recovery action "open-linked-projects" reuses the linker dialog; the
     chat's instance is mounted on demand elsewhere, so the git page opens its
     own instance instead of routing through another panel's state. */
  useEffect(() => {
    if (!linkerOpen || !repo.projectId) return;
    void linkedProjectsRepo.listByProject(repo.projectId).then(setLinkedRoots);
  }, [linkerOpen, repo.projectId]);

  if (!bridge) {
    const notice = describeGitState({ kind: "no-desktop" });
    return (
      <div className="flex h-full items-center justify-center p-6">
        {/* EmptyState takes a component reference for `icon`, not an element
            (src/components/ui/empty-state.tsx:6). */}
        <EmptyState
          icon={MonitorSmartphone}
          title={notice.title}
          description={notice.body}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <GitBranch className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Git</h1>
        <span className="text-sm text-muted-foreground">
          {repo.root ?? "No repository selected"}
          {repo.branch ? ` · ${repo.branch}` : ""}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => void repo.refresh()}
          disabled={repo.loading}
        >
          <RefreshCw className={repo.loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Refresh
        </Button>
      </header>
      <GitStatusPanel repo={repo} onOpenLinkedProjects={() => setLinkerOpen(true)} />
      {linkerOpen && repo.projectId ? (
        <LinkedProjectsDialog
          projectId={repo.projectId}
          roots={linkedRoots}
          onClose={() => {
            setLinkerOpen(false);
            void repo.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
