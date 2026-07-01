import { Octokit } from "octokit";

// GitHub commit proxy. Runs Octokit on the server (the PAT never leaves the
// user's machine — this dev server is local) and returns the latest commits
// with per-commit file lists and stats. The client reconciles them into the
// local `commits` table.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GithubRequest {
  pat: string;
  owner: string;
  repo: string;
  branch?: string;
  /** SHAs the client already has — details are skipped for these. */
  skipShas?: string[];
  perPage?: number;
}

export interface GithubCommitPayload {
  sha: string;
  message: string;
  author: string;
  date: number;
  files: string[];
  additions: number;
  deletions: number;
}

export async function POST(req: Request): Promise<Response> {
  let body: GithubRequest;
  try {
    body = (await req.json()) as GithubRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { pat, owner, repo, branch, skipShas = [], perPage = 30 } = body;
  if (!pat) return Response.json({ error: "Missing personal access token" }, { status: 400 });
  if (!owner || !repo) {
    return Response.json({ error: "Missing repository owner/name" }, { status: 400 });
  }

  const octokit = new Octokit({ auth: pat });
  const skip = new Set(skipShas);

  try {
    const list = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: branch || undefined,
      per_page: Math.min(Math.max(perPage, 1), 50),
    });

    const fresh = list.data.filter((c) => !skip.has(c.sha));
    const detailed: GithubCommitPayload[] = await Promise.all(
      fresh.map(async (c) => {
        try {
          const detail = await octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: c.sha,
          });
          return {
            sha: c.sha,
            message: c.commit.message,
            author:
              c.commit.author?.name ?? c.author?.login ?? "unknown",
            date: c.commit.author?.date
              ? Date.parse(c.commit.author.date)
              : Date.now(),
            files: (detail.data.files ?? []).map((f) => f.filename),
            additions: detail.data.stats?.additions ?? 0,
            deletions: detail.data.stats?.deletions ?? 0,
          };
        } catch {
          // Detail fetch failed (e.g. rate limit) — return the summary.
          return {
            sha: c.sha,
            message: c.commit.message,
            author:
              c.commit.author?.name ?? c.author?.login ?? "unknown",
            date: c.commit.author?.date
              ? Date.parse(c.commit.author.date)
              : Date.now(),
            files: [],
            additions: 0,
            deletions: 0,
          };
        }
      }),
    );

    return Response.json({ commits: detailed, total: list.data.length });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const status = err.status ?? 502;
    const message =
      status === 401
        ? "GitHub rejected the token (401). Check your personal access token."
        : status === 404
          ? `Repository ${owner}/${repo} not found (404). Check owner/name and token scope.`
          : (err.message ?? "GitHub request failed");
    return Response.json({ error: message }, { status });
  }
}
