import type { GitBranchInfo, GitCommitInfo } from "@shared/git";

/**
 * Pure parsers for `git log`, `git for-each-ref` and `git remote get-url`.
 * Separator choices are verified, not assumed:
 *  - `git log --format=…%x1f…%x1e` honours %x1f/%x1e;
 *  - `git for-each-ref --format=…%00…` honours %00, while `%x1f` is printed
 *    literally by for-each-ref (so %00 is used there);
 *  - `%(HEAD)` yields "*" for the current branch and a single space otherwise.
 */

const UNIT = "\u001f";
const RECORD = "\u001e";

export const LOG_FORMAT = "%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%cn%x1f%P%x1f%s%x1f%b%x1e";
export const BRANCH_FORMAT = "%(refname:short)%00%(objectname)%00%(HEAD)%00%(upstream:short)";

export function parseCommitLog(raw: string): GitCommitInfo[] {
  const out: GitCommitInfo[] = [];
  for (const chunk of raw.split(RECORD)) {
    const text = chunk.replace(/^\r?\n/, "");
    if (!text.trim()) continue;
    const parts = text.split(UNIT);
    if (parts.length < 9) continue;
    out.push({
      sha: parts[0],
      shortSha: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      committer: parts[5],
      parents: parts[6].trim() ? parts[6].trim().split(" ") : [],
      subject: parts[7],
      // The body is last: re-join so a stray unit separator inside a body
      // cannot shift the fields before it.
      body: parts.slice(8).join(UNIT).replace(/\r?\n$/, ""),
    });
  }
  return out;
}

export function parseBranchList(raw: string): GitBranchInfo[] {
  const out: GitBranchInfo[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name, oid, head, upstream] = line.split("\u0000");
    if (!name) continue;
    out.push({
      name,
      oid: oid ?? "",
      head: (head ?? "").trim() === "*",
      upstream: upstream ?? "",
    });
  }
  return out;
}

/** Single-line command output, or null when blank. */
export function parseSingleLine(raw: string): string | null {
  const first = raw.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return first ? first : null;
}

/** `git remote get-url origin` -> url, or null when the remote does not exist. */
export function parseRemoteUrl(raw: string): string | null {
  if (/No such remote/.test(raw)) return null;
  return parseSingleLine(raw);
}

/** True when the text looks like git's "not a repository" refusal. */
export function isNotARepoError(text: string): boolean {
  return /not a git repository/i.test(text);
}
