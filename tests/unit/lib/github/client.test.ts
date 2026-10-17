import { describe, it, expect } from "vitest";
import {
  createGithubClient,
  githubErrorMessage,
  normalizeIssue,
  normalizePull,
  summarizeChecks,
  type GithubCheck,
} from "@/lib/server/github/client";

/* Fixture shapes: one non-PR issue and one PR-as-issue (GitHub's issues
 * endpoint returns both), plus a check-run page. Field names follow the
 * installed @octokit/openapi-types schemas. */
const ISSUE = {
  number: 42, title: "Panel flickers on resize", state: "open", state_reason: null,
  body: "Steps to reproduce …", labels: [{ name: "bug" }, { name: "ui" }],
  html_url: "https://github.com/trookish/MasarFlow/issues/42",
  updated_at: "2026-10-16T20:00:00Z",
};
const PR_AS_ISSUE = {
  number: 43, title: "feat: git panel", state: "open",
  body: "", labels: [],
  html_url: "https://github.com/trookish/MasarFlow/pull/43",
  updated_at: "2026-10-16T21:00:00Z",
  pull_request: { url: "https://api.github.com/repos/trookish/MasarFlow/pulls/43" },
};
const PULL = {
  number: 43, title: "feat: git panel", state: "open", draft: false, merged: false,
  html_url: "https://github.com/trookish/MasarFlow/pull/43",
  updated_at: "2026-10-16T21:00:00Z",
  head: { ref: "feat/git-panel", sha: "abcdef1234567890abcdef1234567890abcdef12" },
};
const CHECKS = {
  total_count: 2,
  check_runs: [
    { name: "build", status: "completed", conclusion: "success", html_url: "https://github.com/x/1" },
    { name: "lint", status: "completed", conclusion: "failure", html_url: "https://github.com/x/2" },
  ],
};

function stubFetch(payloads: unknown[]) {
  const calls: string[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push(`${init?.method ?? "GET"} ${String(input)}`);
    const body = payloads.shift() ?? {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, impl };
}

describe("normalizeIssue", () => {
  it("reads a plain issue", () => {
    expect(normalizeIssue(ISSUE)).toEqual({
      number: 42,
      title: "Panel flickers on resize",
      body: "Steps to reproduce …",
      state: "open",
      labels: ["bug", "ui"],
      htmlUrl: "https://github.com/trookish/MasarFlow/issues/42",
      updatedAt: "2026-10-16T20:00:00Z",
      isPullRequest: false,
    });
  });
  it("flags the pull-request flavour the issues endpoint also returns", () => {
    expect(normalizeIssue(PR_AS_ISSUE).isPullRequest).toBe(true);
  });
  it("survives missing optional fields", () => {
    expect(normalizeIssue({ number: 1, title: "t", state: "closed" })).toMatchObject({
      body: "", labels: [], isPullRequest: false, updatedAt: "",
    });
  });
});

describe("summarizeChecks", () => {
  const check = (status: string, conclusion: string | null): GithubCheck => ({
    name: "c", status, conclusion, htmlUrl: "",
  });
  it("has no checks", () => expect(summarizeChecks([])).toBe("none"));
  it("counts anything unfinished as pending", () => {
    expect(summarizeChecks([check("queued", null), check("completed", "success")])).toBe("pending");
  });
  it("counts success and skipped as success", () => {
    expect(summarizeChecks([check("completed", "success"), check("completed", "skipped")])).toBe("success");
    expect(summarizeChecks([check("completed", "neutral")])).toBe("success");
  });
  it("lets a failure win", () => {
    expect(summarizeChecks([check("completed", "success"), check("completed", "failure")])).toBe("failure");
    expect(summarizeChecks([check("completed", "cancelled")])).toBe("failure");
  });
});

describe("normalizePull", () => {
  it("carries head sha and the CI summary", () => {
    const pull = normalizePull(PULL, CHECKS.check_runs.map((c) => ({ ...c, conclusion: c.conclusion, status: c.status, htmlUrl: c.html_url })));
    expect(pull).toMatchObject({
      number: 43, state: "open", draft: false, merged: false,
      headSha: "abcdef1234567890abcdef1234567890abcdef12", ci: "failure",
    });
    expect(pull.checks.map((c) => c.name)).toEqual(["build", "lint"]);
  });
  it("reads a merged pull closed", () => {
    expect(normalizePull({ ...PULL, state: "closed", merged: true }, []).state).toBe("closed");
  });
});

describe("createGithubClient", () => {
  it("lists issues from the repo endpoint and hides pull requests behind a count", async () => {
    const { calls, impl } = stubFetch([[ISSUE, PR_AS_ISSUE]]);
    const client = createGithubClient({ token: "t", owner: "trookish", repo: "MasarFlow", fetchImpl: impl });
    const result = await client.listIssues({ state: "open" });
    expect(calls[0]).toContain("https://api.github.com/repos/trookish/MasarFlow/issues");
    expect(result.issues.map((i) => i.number)).toEqual([42]);
    expect(result.pullCount).toBe(1);
  });

  it("creates an issue and returns its number", async () => {
    const { calls, impl } = stubFetch([{ number: 99, title: "New", state: "open", html_url: "u", updated_at: "d" }]);
    const client = createGithubClient({ token: "t", owner: "o", repo: "r", fetchImpl: impl });
    const created = await client.createIssue({ title: "New", body: "b", labels: ["bug"] });
    expect(calls[0]).toMatch(/^POST https:\/\/api\.github\.com\/repos\/o\/r\/issues$/);
    expect(created.number).toBe(99);
  });

  it("closes an issue and optionally comments", async () => {
    const { calls, impl } = stubFetch([{ number: 7, state: "closed" }, { id: 1 }]);
    const client = createGithubClient({ token: "t", owner: "o", repo: "r", fetchImpl: impl });
    await client.closeIssue(7, "Closed by commit abc1234.");
    expect(calls[0]).toMatch(/^PATCH https:\/\/api\.github\.com\/repos\/o\/r\/issues\/7$/);
    expect(calls[1]).toMatch(/^POST https:\/\/api\.github\.com\/repos\/o\/r\/issues\/7\/comments$/);
  });

  it("attaches check runs to the first N pulls only", async () => {
    const pulls = [PULL, { ...PULL, number: 44, head: { ...PULL.head, sha: "1".repeat(40) } }];
    const { calls, impl } = stubFetch([pulls, CHECKS, { total_count: 0, check_runs: [] }]);
    const client = createGithubClient({ token: "t", owner: "o", repo: "r", fetchImpl: impl });
    const result = await client.listPulls({ state: "open", checkLimit: 2 });
    expect(result.map((p) => p.number)).toEqual([43, 44]);
    expect(result[0].ci).toBe("failure");
    expect(result[1].ci).toBe("none");
    expect(calls.filter((c) => c.includes("/check-runs"))).toHaveLength(2);
  });

  it("maps a 401 to a friendly error the caller can show", async () => {
    const impl = async (): Promise<Response> =>
      new Response(JSON.stringify({ message: "Bad credentials" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    const client = createGithubClient({ token: "bad", owner: "o", repo: "r", fetchImpl: impl });
    // Octokit's RequestError carries the body message ("Bad credentials") and
    // the status on `.status`; githubErrorMessage is what turns that into the
    // user-facing copy (the routes call it with the caught error).
    const error = await client.listIssues({}).then(
      () => null,
      (e: unknown) => e,
    );
    expect((error as { status?: number } | null)?.status).toBe(401);
    expect(githubErrorMessage(error, "o", "r")).toContain("401");
  });
});
