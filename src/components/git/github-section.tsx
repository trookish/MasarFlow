"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudDownload, CloudOff, ExternalLink, GitPullRequest, Plus, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGithub, isGithubConfigured } from "@/lib/stores/github";
import { parseGithubRemote } from "@/lib/github/remote";
import { applyIssueTaskSync, listIssueLinkedTasks, planIssueTaskSync, type SyncRepo } from "@/lib/github/issue-sync";
import type { GithubIssue, GithubPull } from "@/lib/server/github/client";
import type { GitRepo } from "@/lib/git/use-git-repo";

const ciTone: Record<string, string> = {
  success: "border-emerald-500/50 text-emerald-600",
  failure: "border-red-500/50 text-red-600",
  pending: "border-amber-500/50 text-amber-600",
  none: "border-border text-muted-foreground",
};

export function GithubSection({ repo }: { repo: GitRepo }) {
  const github = useGithub();
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [issues, setIssues] = useState<GithubIssue[]>([]);
  const [pulls, setPulls] = useState<GithubPull[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [synced, setSynced] = useState<string | null>(null);

  const remote = useMemo(() => (remoteUrl ? parseGithubRemote(remoteUrl) : null), [remoteUrl]);
  const target: SyncRepo | null = useMemo(
    () => (remote ?? (github.owner && github.repo ? { owner: github.owner, repo: github.repo } : null)),
    [remote, github.owner, github.repo],
  );

  useEffect(() => {
    void (async () => {
      if (!repo.bridge || !repo.root) return;
      const result = await repo.bridge.remote(repo.root);
      if (result.ok) setRemoteUrl(result.data?.url ?? null);
    })();
  }, [repo.bridge, repo.root, repo.branch]);

  const call = useCallback(
    async (path: "issues" | "pulls", body: Record<string, unknown>) => {
      const res = await fetch(`/api/github/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pat: github.pat, owner: target?.owner, repo: target?.repo, ...body }),
      });
      const json = (await res.json()) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `GitHub request failed (${res.status})`);
      return json;
    },
    [github.pat, target],
  );

  const load = useCallback(async () => {
    if (!isGithubConfigured(github) || !target) return;
    setBusy(true);
    setError(null);
    try {
      const issuesJson = (await call("issues", { action: "list", state: "open" })) as unknown as { issues: GithubIssue[] };
      const pullsJson = (await call("pulls", { action: "list", state: "open", checkLimit: 10 })) as unknown as { pulls: GithubPull[] };
      setIssues(issuesJson.issues ?? []);
      setPulls(pullsJson.pulls ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [call, github, target]);

  const syncTasks = async () => {
    if (!repo.projectId || !target) return;
    setBusy(true);
    setError(null);
    try {
      const tasks = await listIssueLinkedTasks(repo.projectId, target);
      const plan = planIssueTaskSync(tasks, issues, target);
      const result = await applyIssueTaskSync(repo.projectId, plan, target);
      setSynced(
        `tasks: +${result.created} created, ${result.closed} closed, ${result.unchanged} unchanged` +
          (result.orphanRefs.length ? `, ${result.orphanRefs.length} issue(s) not in this page` : ""),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createIssue = async () => {
    if (!draftTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await call("issues", { action: "create", title: draftTitle, body: draftBody });
      setDraftTitle("");
      setDraftBody("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const closeIssue = async (number: number) => {
    setBusy(true);
    setError(null);
    try {
      await call("issues", { action: "close", number, comment: "Closed from MasarFlow." });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isGithubConfigured(github)) {
    return (
      <div className="flex items-center gap-2 rounded border border-border p-3 text-xs text-muted-foreground">
        <CloudOff className="h-4 w-4" />
        GitHub is not configured. Add a token, owner and repository in Settings.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2 border-t border-border pt-3">
      <header className="flex flex-wrap items-center gap-2">
        <GitPullRequest className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">GitHub</h2>
        {target ? (
          <span className="text-xs text-muted-foreground">
            {target.owner}/{target.repo}
            {remote ? "" : " (from Settings — no origin remote)"}
          </span>
        ) : null}
        <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => void load()}>
          <RefreshCw className={busy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Load
        </Button>
        <Button size="sm" variant="outline" disabled={busy || !issues.length} onClick={() => void syncTasks()}>
          <CloudDownload className="h-3.5 w-3.5" /> Sync to tasks
        </Button>
      </header>

      {error ? (
        <p className="rounded border border-red-500/40 bg-red-500/5 p-2 text-xs text-red-600">{error}</p>
      ) : null}
      {synced ? <p className="text-xs text-muted-foreground">{synced}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Open issues ({issues.length})</h3>
          <ScrollArea className="min-h-0 flex-1">
            <ul>
              {issues.map((issue) => (
                <li key={issue.number} className="flex items-start gap-2 border-b border-border/60 py-1">
                  <span className="min-w-0 flex-1">
                    <a
                      href={issue.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 truncate text-xs hover:underline"
                    >
                      <span className="font-mono text-muted-foreground">#{issue.number}</span>
                      {issue.title}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <span className="flex gap-1 pt-0.5">
                      {issue.labels.map((label) => (
                        <Badge key={label} variant="outline" className="text-[10px]">{label}</Badge>
                      ))}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" title="Close on GitHub" disabled={busy} onClick={() => void closeIssue(issue.number)}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {!issues.length ? <p className="py-1 text-xs text-muted-foreground">No open issues.</p> : null}
            </ul>
          </ScrollArea>
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="New issue title" className="h-7 text-xs" />
            <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} placeholder="Describe the issue…" rows={2} className="text-xs" />
            <Button size="sm" disabled={busy || !draftTitle.trim()} onClick={() => void createIssue()}>
              <Plus className="h-3.5 w-3.5" /> Create issue
            </Button>
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Open pull requests ({pulls.length})</h3>
          <ScrollArea className="min-h-0 flex-1">
            <ul>
              {pulls.map((pull) => (
                <li key={pull.number} className="flex items-center gap-2 border-b border-border/60 py-1">
                  <a
                    href={pull.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-xs hover:underline"
                  >
                    <span className="font-mono text-muted-foreground">#{pull.number}</span> {pull.title}
                  </a>
                  {pull.draft ? <Badge variant="outline" className="text-[10px]">draft</Badge> : null}
                  <Badge variant="outline" className={`text-[10px] ${ciTone[pull.ci]}`}>CI {pull.ci}</Badge>
                </li>
              ))}
              {!pulls.length ? <p className="py-1 text-xs text-muted-foreground">No open pull requests.</p> : null}
            </ul>
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}
