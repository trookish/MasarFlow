"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, GitBranch, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { branchNameProblem, summarizeCounts } from "@/lib/git/format";
import { gitFailureCopy } from "@/lib/git/client";
import type { GitBranchInfo } from "@desktop-shared/git";
import type { GitRepo } from "@/lib/git/use-git-repo";

export function GitBranchMenu({ repo, openSignal = 0 }: { repo: GitRepo; openSignal?: number }) {
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  /* The panel's "create-branch" recovery action asks this menu to open and
     focus its name input — the only place a branch can be created. */
  useEffect(() => {
    if (openSignal <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external open request from the git panel
    setOpen(true);
    const id = window.setTimeout(() => nameRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [openSignal]);

  const load = useCallback(async () => {
    if (!repo.bridge || !repo.root) return;
    const result = await repo.bridge.branches(repo.root);
    if (result.ok) setBranches(result.data);
  }, [repo.bridge, repo.root]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial branch list load
    void load();
  }, [load, repo.branch]);

  const switchTo = (target: string) => {
    const dirty = (repo.status?.unstaged.length ?? 0) > 0;
    if (dirty) {
      setConfirm(target);
      return;
    }
    void doSwitch(target);
  };

  const doSwitch = async (target: string) => {
    if (!repo.bridge || !repo.root) return;
    await repo.mutate(() => repo.bridge!.switchBranch(repo.root!, target), "switch");
    setOpen(false);
    setConfirm(null);
    await repo.refresh();
  };

  const create = async () => {
    const invalid = branchNameProblem(name);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    if (!repo.bridge || !repo.root) return;
    const result = await repo.mutate(
      () => repo.bridge!.createBranch(repo.root!, name.trim(), true),
      "create-branch",
    );
    if (!result.ok) {
      setProblem(gitFailureCopy(result.code, result.message));
      return;
    }
    setProblem(null);
    setName("");
    setOpen(false);
    await load();
    await repo.refresh();
  };

  const dirtyCount = (repo.status?.unstaged.length ?? 0) + (repo.status?.untracked.length ?? 0);

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        <GitBranch className="h-3.5 w-3.5" />
        {repo.detached ? "detached HEAD" : (repo.branch ?? "no branch")}
      </Button>
      {repo.detached ? <Badge variant="outline" className="ml-2">detached</Badge> : null}
      {open ? (
        <div className="absolute z-20 mt-1 w-72 rounded border border-border bg-background p-2 shadow-lg">
          <p className="px-1 pb-1 text-xs text-muted-foreground">{summarizeCounts(repo.status!)}</p>
          <ul className="max-h-56 overflow-y-auto">
            {branches.map((branch) => (
              <li key={branch.name}>
                <button
                  type="button"
                  disabled={branch.head}
                  onClick={() => switchTo(branch.name)}
                  className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent disabled:opacity-60"
                >
                  {branch.head ? <Check className="h-3 w-3" /> : <span className="w-3" />}
                  <span className="truncate font-mono">{branch.name}</span>
                  {branch.upstream ? (
                    <span className="ml-auto truncate text-muted-foreground">{branch.upstream}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="feat/new-branch"
              className="h-7 font-mono text-xs"
            />
            <Button
              size="sm"
              aria-label="Create branch"
              onClick={() => void create()}
              disabled={!name.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          {problem ? <p className="pt-1 text-xs text-red-600">{problem}</p> : null}
          {repo.status?.upstream ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {repo.status.upstream} · {repo.status.ahead} ahead · {repo.status.behind} behind
            </p>
          ) : (
            <p className="pt-1 text-xs text-muted-foreground">No upstream configured.</p>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={`Switch to ${confirm ?? ""}?`}
        description={`${dirtyCount} uncommitted change${dirtyCount === 1 ? "" : "s"} will follow you onto that branch.`}
        confirmLabel="Switch anyway"
        destructive={false}
        onConfirm={() => confirm && void doSwitch(confirm)}
      />
    </div>
  );
}
