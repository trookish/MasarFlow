import type { SyncRepo } from "@/lib/github/issue-sync";

/**
 * Derive owner/repo from an `origin` remote URL so the panel can prefill the
 * GitHub section. Pure and host-strict: only github.com maps, anything else
 * returns null (the UI then asks the user to type owner/repo, or to add a
 * remote — the MasarFlow working tree itself has no remote today).
 */

export interface GithubRemote extends SyncRepo {
  htmlUrl: string;
}

export function parseGithubRemote(url: string): GithubRemote | null {
  const value = (url ?? "").trim().replace(/\.git$/, "");
  if (!value) return null;

  const https = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/.exec(value);
  const ssh = /^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+)$/.exec(value);
  const scp = /^git@github\.com:([^/\s]+)\/([^/\s]+)$/.exec(value);
  const match = https ?? ssh ?? scp;
  if (!match) return null;
  const [, owner, repo] = match;
  return { owner, repo, htmlUrl: `https://github.com/${owner}/${repo}` };
}
