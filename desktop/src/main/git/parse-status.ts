import type { GitFileChange, GitRepoStatus, GitStatusLetter } from "@shared/git";

/**
 * `git status --porcelain=v2 --branch -z` parser. Pure.
 *
 * Verified against git 2.53.0 output:
 *  - in -z mode every record (headers included) ends with NUL, not LF;
 *  - `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`;
 *  - `2 <XY> <sub> … <X><score> <path>\0<origPath>`;
 *  - `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`;
 *  - `? <path>` untracked, `! <path>` ignored;
 *  - `# branch.head (detached)` in a detached HEAD, `# branch.upstream <name>`,
 *    `# branch.ab +<ahead> -<behind>`, `# branch.oid (initial)` before the first commit.
 * Paths are repo-root-relative even when git runs in a subdirectory, so the
 * service always runs with cwd = the repository root.
 */

const ZERO_OID = "0000000000000000000000000000000000000000";

function letter(ch: string | undefined): GitStatusLetter {
  return (ch && ch.length === 1 ? (ch as GitStatusLetter) : ".");
}

export function parseStatusPorcelainV2(raw: string): GitRepoStatus {
  const status: GitRepoStatus = {
    head: "",
    detached: false,
    oid: "",
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };
  const records = raw.split("\u0000").filter((r) => r.length > 0);

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.startsWith("# branch.oid ")) {
      const oid = rec.slice("# branch.oid ".length).trim();
      status.oid = oid === "(initial)" ? "" : oid;
      continue;
    }
    if (rec.startsWith("# branch.head ")) {
      const head = rec.slice("# branch.head ".length).trim();
      status.detached = head === "(detached)";
      status.head = status.detached ? "HEAD" : head;
      continue;
    }
    if (rec.startsWith("# branch.upstream ")) {
      status.upstream = rec.slice("# branch.upstream ".length).trim();
      continue;
    }
    if (rec.startsWith("# branch.ab ")) {
      const m = /\+(\d+) -(\d+)/.exec(rec);
      if (m) {
        status.ahead = Number(m[1]);
        status.behind = Number(m[2]);
      }
      continue;
    }
    if (rec.startsWith("# ")) continue;

    const kind = rec[0];
    if (kind === "?") {
      status.untracked.push(rec.slice(2));
      continue;
    }
    if (kind === "!") continue;

    const fields = rec.split(" ");
    if (kind === "1" && fields.length >= 9) {
      const xy = fields[1];
      const path = fields.slice(8).join(" ");
      const change: GitFileChange = {
        path,
        origPath: null,
        index: letter(xy[0]),
        worktree: letter(xy[1]),
        conflicted: false,
      };
      if (change.index !== "." && change.index !== "?") status.staged.push(change);
      if (change.worktree !== "." ) status.unstaged.push({ ...change });
      continue;
    }
    if (kind === "2" && fields.length >= 10) {
      const xy = fields[1];
      const path = fields.slice(9).join(" ");
      // In -z mode the original path is the NEXT NUL-separated token.
      const origPath = records[i + 1] ?? null;
      if (origPath !== null) i++;
      const change: GitFileChange = {
        path,
        origPath,
        index: letter(xy[0]),
        worktree: letter(xy[1]),
        conflicted: false,
      };
      if (change.index !== "." && change.index !== "?") status.staged.push(change);
      if (change.worktree !== ".") status.unstaged.push({ ...change });
      continue;
    }
    if (kind === "u" && fields.length >= 11) {
      const xy = fields[1];
      status.conflicted.push({
        path: fields.slice(10).join(" "),
        origPath: null,
        index: letter(xy[0]),
        worktree: letter(xy[1]),
        conflicted: true,
      });
      continue;
    }
  }
  return status;
}

/** True when the worktree is clean (no staged, unstaged, untracked or conflicted files). */
export function isClean(status: GitRepoStatus): boolean {
  return (
    status.staged.length === 0 &&
    status.unstaged.length === 0 &&
    status.untracked.length === 0 &&
    status.conflicted.length === 0
  );
}

/** True when HEAD is the all-zero id — a repository with no commits yet. */
export function isEmptyRepo(status: GitRepoStatus): boolean {
  return status.oid === "" || status.oid === ZERO_OID;
}
