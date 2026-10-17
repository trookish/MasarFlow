import { Octokit } from "octokit";

/**
 * GitHub REST access for issues, pull requests and CI — one injectable client.
 *
 * Lives next to the other server helpers because it is called from route
 * handlers only (the PAT stays on this machine; the routes are behind P2's
 * launch-token guard in src/proxy.ts). Every method takes `fetchImpl` so the
 * unit tests never touch the network, and the fixtures in the test file are
 * minimal versions of the shapes `@octokit/openapi-types` documents.
 */

export type CiSummary = "success" | "failure" | "pending" | "none";

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  htmlUrl: string;
  updatedAt: string;
  /** GitHub's issues endpoint also returns pull requests — flagged, then filtered by callers. */
  isPullRequest: boolean;
}

export interface GithubCheck {
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
}

export interface GithubPull {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  htmlUrl: string;
  updatedAt: string;
  headSha: string;
  checks: GithubCheck[];
  ci: CiSummary;
}

export interface GithubClientOptions {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}

/** Conclusions that need a human. `cancelled` counts as failure on purpose: it needs a rerun. */
const FAILURE_CONCLUSIONS = new Set(["failure", "timed_out", "action_required", "startup_failure", "cancelled"]);
const SUCCESS_CONCLUSIONS = new Set(["success", "skipped", "neutral"]);

export function summarizeChecks(checks: GithubCheck[]): CiSummary {
  if (!checks.length) return "none";
  if (checks.some((c) => FAILURE_CONCLUSIONS.has(c.conclusion ?? ""))) return "failure";
  if (checks.some((c) => c.conclusion === null || !SUCCESS_CONCLUSIONS.has(c.conclusion))) return "pending";
  return "success";
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;

export function normalizeIssue(raw: Raw): GithubIssue {
  const labels = Array.isArray(raw.labels)
    ? (raw.labels as unknown[])
        .map((l) => (typeof l === "string" ? l : str((l as Raw)?.name)))
        .filter(Boolean)
    : [];
  return {
    number: num(raw.number),
    title: str(raw.title),
    body: str(raw.body),
    state: raw.state === "closed" ? "closed" : "open",
    labels,
    htmlUrl: str(raw.html_url),
    updatedAt: str(raw.updated_at),
    isPullRequest: raw.pull_request !== undefined && raw.pull_request !== null,
  };
}

export function normalizeCheckRun(raw: Raw): GithubCheck {
  return {
    name: str(raw.name),
    status: str(raw.status),
    conclusion: typeof raw.conclusion === "string" ? raw.conclusion : null,
    htmlUrl: str(raw.html_url),
  };
}

export function normalizePull(raw: Raw, checks: GithubCheck[]): GithubPull {
  const head = (raw.head ?? {}) as Raw;
  return {
    number: num(raw.number),
    title: str(raw.title),
    state: raw.state === "closed" ? "closed" : "open",
    draft: bool(raw.draft),
    merged: bool(raw.merged),
    htmlUrl: str(raw.html_url),
    updatedAt: str(raw.updated_at),
    headSha: str(head.sha),
    checks,
    ci: summarizeChecks(checks),
  };
}

/** Turns an Octokit failure into a message the panel can show verbatim. */
export function githubErrorMessage(error: unknown, owner: string, repo: string): string {
  const err = error as { status?: number; message?: string };
  if (err.status === 401) return "GitHub rejected the token (401). Check the personal access token in Settings.";
  if (err.status === 403) return "GitHub refused the request (403) — the token may lack 'issues' or 'pull requests' scope, or the rate limit is exhausted.";
  if (err.status === 404) return `Repository ${owner}/${repo} not found (404). Check owner/name and token scope.`;
  return err.message ?? "GitHub request failed";
}

export function createGithubClient(options: GithubClientOptions) {
  const { token, owner, repo } = options;
  const octokit = new Octokit({
    auth: token,
    ...(options.fetchImpl ? { request: { fetch: options.fetchImpl } } : {}),
  });

  return {
    /** Non-PR issues, newest activity first. */
    async listIssues(
      args: { state?: "open" | "closed" | "all"; labels?: string; perPage?: number } = {},
    ): Promise<{ issues: GithubIssue[]; pullCount: number }> {
      const res = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: args.state ?? "open",
        ...(args.labels ? { labels: args.labels } : {}),
        per_page: Math.min(Math.max(args.perPage ?? 30, 1), 100),
        sort: "updated",
        direction: "desc",
      });
      const all = (Array.isArray(res.data) ? (res.data as unknown as Raw[]) : []).map(normalizeIssue);
      return {
        issues: all.filter((i) => !i.isPullRequest),
        pullCount: all.filter((i) => i.isPullRequest).length,
      };
    },

    async createIssue(args: { title: string; body?: string; labels?: string[] }): Promise<GithubIssue> {
      const res = await octokit.rest.issues.create({
        owner,
        repo,
        title: args.title,
        body: args.body ?? "",
        ...(args.labels?.length ? { labels: args.labels } : {}),
      });
      return normalizeIssue(res.data as unknown as Raw);
    },

    async closeIssue(number: number, comment?: string): Promise<GithubIssue> {
      const res = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: number,
        state: "closed",
      });
      if (comment?.trim()) {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: number, body: comment });
      }
      return normalizeIssue(res.data as unknown as Raw);
    },

    /** Pulls with CI status. `checkLimit` caps the extra API calls (rate limits). */
    async listPulls(
      args: { state?: "open" | "closed" | "all"; perPage?: number; checkLimit?: number } = {},
    ): Promise<GithubPull[]> {
      const res = await octokit.rest.pulls.list({
        owner,
        repo,
        state: args.state ?? "open",
        per_page: Math.min(Math.max(args.perPage ?? 20, 1), 100),
        sort: "updated",
        direction: "desc",
      });
      const raws = Array.isArray(res.data) ? (res.data as unknown as Raw[]) : [];
      const limit = Math.min(args.checkLimit ?? 10, raws.length);
      const checksByIndex: GithubCheck[][] = [];
      for (let i = 0; i < limit; i++) {
        const sha = str(((raws[i].head ?? {}) as Raw).sha);
        if (!sha) {
          checksByIndex[i] = [];
          continue;
        }
        try {
          const checks = await octokit.rest.checks.listForRef({ owner, repo, ref: sha, per_page: 100 });
          checksByIndex[i] = ((checks.data as unknown as Raw).check_runs as Raw[] ?? []).map(normalizeCheckRun);
        } catch {
          checksByIndex[i] = [];
        }
      }
      return raws.map((raw, i) => normalizePull(raw, checksByIndex[i] ?? []));
    },
  };
}

export type GithubClient = ReturnType<typeof createGithubClient>;
