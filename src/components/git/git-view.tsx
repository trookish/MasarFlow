"use client";

import { RefreshCw, GitBranch, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GIT_DESKTOP_REQUIRED, gitBridge } from "@/lib/git/client";
import { useGitRepo } from "@/lib/git/use-git-repo";
import { GitStatusPanel } from "@/components/git/git-status-panel";

export function GitView() {
  const bridge = gitBridge();
  const repo = useGitRepo();

  if (!bridge) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        {/* EmptyState takes a component reference for `icon`, not an element
            (src/components/ui/empty-state.tsx:6). */}
        <EmptyState
          icon={MonitorSmartphone}
          title="Git needs the desktop app"
          description={GIT_DESKTOP_REQUIRED}
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
      <GitStatusPanel repo={repo} />
    </div>
  );
}
