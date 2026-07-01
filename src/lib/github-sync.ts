import { commitsRepo, devLogsRepo, specsRepo, tasksRepo, linksRepo } from "@/lib/db/repos";
import type { GithubSettings } from "@/lib/stores/github";

/**
 * GitHub commit sync: pulls real commits through the /api/github Octokit
 * proxy, reconciles them into the local `commits` table, writes dev-log
 * entries, and auto-links commits to specs (by RFC number in the message) and
 * tasks (by title mention). Pure helpers are exported for unit testing.
 */

export interface RemoteCommit {
  sha: string;
  message: string;
  author: string;
  date: number;
  files: string[];
  additions: number;
  deletions: number;
}

/** Extract referenced spec numbers like "RFC-001" from a commit message. Pure. */
export function extractSpecRefs(message: string): string[] {
  const seen = new Set<string>();
  for (const m of message.matchAll(/RFC-\d{1,4}/gi)) {
    seen.add(m[0].toUpperCase());
  }
  return [...seen];
}

export interface SyncCommitsResult {
  added: number;
  total: number;
}

/** Fetch the latest commits from GitHub and reconcile them locally. */
export async function syncGithubCommits(
  projectId: string,
  settings: Pick<GithubSettings, "pat" | "owner" | "repo" | "branch">,
): Promise<SyncCommitsResult> {
  const existing = await commitsRepo.listByProject(projectId);
  const knownShas = existing.map((c) => c.sha);

  const res = await fetch("/api/github", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pat: settings.pat,
      owner: settings.owner,
      repo: settings.repo,
      branch: settings.branch || undefined,
      skipShas: knownShas,
    }),
  });
  const data = (await res.json()) as {
    commits?: RemoteCommit[];
    total?: number;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `GitHub sync failed (${res.status})`);

  const known = new Set(knownShas);
  const fresh = (data.commits ?? []).filter((c) => !known.has(c.sha));

  const [specs, tasks] = await Promise.all([
    specsRepo.listByProject(projectId),
    tasksRepo.listByProject(projectId),
  ]);
  const specByNumber = new Map(specs.map((s) => [s.number.toUpperCase(), s]));

  let added = 0;
  for (const rc of fresh) {
    // Auto-link specs referenced by number, and tasks whose title appears
    // verbatim in the commit message.
    const linkedSpecIds = extractSpecRefs(rc.message)
      .map((n) => specByNumber.get(n)?.id)
      .filter((id): id is string => Boolean(id));
    const msgLower = rc.message.toLowerCase();
    const linkedTaskIds = tasks
      .filter((t) => t.title.length >= 8 && msgLower.includes(t.title.toLowerCase()))
      .map((t) => t.id);

    const commit = await commitsRepo.create({
      projectId,
      sha: rc.sha,
      message: rc.message,
      author: rc.author,
      date: rc.date,
      files: rc.files,
      additions: rc.additions,
      deletions: rc.deletions,
      linkedSpecIds,
      linkedTaskIds,
    });

    for (const specId of linkedSpecIds) {
      await linksRepo.create({
        projectId,
        sourceType: "commit",
        sourceId: commit.id,
        targetType: "spec",
        targetId: specId,
        linkType: "implements",
      });
    }
    for (const taskId of linkedTaskIds) {
      await linksRepo.create({
        projectId,
        sourceType: "commit",
        sourceId: commit.id,
        targetType: "task",
        targetId: taskId,
        linkType: "implements",
      });
    }

    await devLogsRepo.create({
      projectId,
      type: "commit",
      title: rc.message.split("\n")[0].slice(0, 120),
      body: [
        `Commit \`${rc.sha.slice(0, 7)}\` by ${rc.author}`,
        rc.files.length
          ? `${rc.files.length} file${rc.files.length === 1 ? "" : "s"} changed (+${rc.additions} / -${rc.deletions})`
          : "",
      ]
        .filter(Boolean)
        .join(" — "),
      refType: "commit",
      refId: commit.id,
      createdAt: rc.date,
    });
    added++;
  }

  return { added, total: data.total ?? fresh.length };
}
