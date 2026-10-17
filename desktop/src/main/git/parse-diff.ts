import type { GitDiffFile, GitNumstatEntry } from "@shared/git";

/**
 * Diff parsers. Pure; every input shape below was captured from git 2.53.0
 * (see the plan's fixture provenance) before this file was written:
 *  - `git diff --numstat -z`: "<add>\t<del>\t<path>\0", renames as
 *    "<add>\t<del>\t\0<old>\0<new>\0", binaries as "-\t-\t<path>\0";
 *  - unified diff: "diff --git a/x b/y", "new file mode", "deleted file mode",
 *    "similarity index", "rename from/rename to", "index", "--- /dev/null",
 *    "+++ b/<path>" (a TAB and a timestamp may follow the path),
 *    "Binary files a/x and b/x differ", "@@ … @@", "\ No newline at end of file".
 */

/** Count +/- lines of a parsed file (used when numstat has no entry). */
export function countDiffLines(file: GitDiffFile): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
    }
  }
  return { additions, deletions };
}

/** git appends "\t<timestamp>" to ---/+++ when the path needs it; drop it. */
export function stripTabSuffix(line: string): string {
  const tab = line.indexOf("\t");
  return (tab === -1 ? line : line.slice(0, tab)).trimEnd();
}

/** Decode git's C-style quoted path form ("a/\331\205.txt" with quotepath on). */
export function unquoteGitPath(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith('"') || !text.endsWith('"')) return text;
  const inner = text.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\") {
      const next = inner[i + 1];
      if (next === undefined) break;
      if (/[0-7]/.test(next)) {
        const oct = inner.slice(i + 1, i + 4);
        const m = /^[0-7]{1,3}/.exec(oct);
        if (m) {
          bytes.push(parseInt(m[0], 8));
          i += m[0].length;
          continue;
        }
      }
      const map: Record<string, number> = { n: 10, t: 9, r: 13, '"': 34, "\\": 92, a: 7, b: 8, f: 12, v: 11 };
      bytes.push(map[next] ?? next.charCodeAt(0));
      i++;
      continue;
    }
    bytes.push(ch.charCodeAt(0));
  }
  return Buffer.from(bytes).toString("utf8");
}

function stripPrefix(p: string): string {
  return /^[ab]\//.test(p) ? p.slice(2) : p;
}

export function parseNumstatZ(raw: string): GitNumstatEntry[] {
  const tokens = raw.split("\u0000");
  const out: GitNumstatEntry[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const parts = token.split("\t");
    if (parts.length < 3) continue;
    const additions = parts[0] === "-" ? 0 : Number(parts[0]);
    const deletions = parts[1] === "-" ? 0 : Number(parts[1]);
    const binary = parts[0] === "-" || parts[1] === "-";
    if (parts[2] === "") {
      // rename: <add>\t<del>\t\0<old>\0<new>\0
      const origPath = tokens[i + 1] || null;
      const path = tokens[i + 2] || "";
      i += 2;
      if (!path) continue;
      out.push({ path: unquoteGitPath(path), origPath: origPath ? unquoteGitPath(origPath) : null, additions, deletions, binary });
      continue;
    }
    out.push({ path: unquoteGitPath(parts.slice(2).join("\t")), origPath: null, additions, deletions, binary });
  }
  return out;
}

/** Path from a `diff --git a/<x> b/<y>` header, best effort (spaces are ambiguous). */
function pathFromDiffLine(line: string): string | null {
  const rest = line.slice("diff --git ".length);
  const quoted = /^"a\/(.*)" "b\/(.*)"$/.exec(rest);
  if (quoted) return unquoteGitPath(`"b/${quoted[2]}"`);
  const m = /^a\/(.+) b\/(.+)$/.exec(rest);
  return m ? m[2] : null;
}

export function parseUnifiedDiff(raw: string): GitDiffFile[] {
  const files: GitDiffFile[] = [];
  let current: GitDiffFile | null = null;
  const push = (): void => {
    if (current) files.push(current);
    current = null;
  };

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      push();
      const path = pathFromDiffLine(line);
      current = {
        path: path ? stripPrefix(path) : "",
        origPath: null,
        status: "modified",
        binary: false,
        additions: 0,
        deletions: 0,
        isNew: false,
        hunks: [],
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file mode")) {
      current.status = "added";
      current.isNew = true;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.status = "renamed";
      current.origPath = stripPrefix(unquoteGitPath(line.slice("rename from ".length)));
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.path = stripPrefix(unquoteGitPath(line.slice("rename to ".length)));
      continue;
    }
    if (line.startsWith("copy from ") || line.startsWith("copy to ")) {
      current.status = "copied";
      const value = stripPrefix(unquoteGitPath(line.slice(line.indexOf(" ") + 1)));
      if (line.startsWith("copy from ")) current.origPath = value;
      else current.path = value;
      continue;
    }
    if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
      current.binary = true;
      current.status = "binary";
      continue;
    }
    if (line.startsWith("--- ")) {
      const value = stripTabSuffix(line.slice(4));
      if (value === "/dev/null") current.isNew = true;
      else current.origPath = current.origPath ?? stripPrefix(unquoteGitPath(value));
      continue;
    }
    if (line.startsWith("+++ ")) {
      const value = stripPrefix(unquoteGitPath(stripTabSuffix(line.slice(4))));
      if (value !== "/dev/null") current.path = value;
      continue;
    }
    if (line.startsWith("@@")) {
      current.hunks.push({ header: line.trimEnd(), lines: [] });
      continue;
    }
    const hunk = current.hunks[current.hunks.length - 1];
    if (hunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line.startsWith("\\") || line === "")) {
      if (line !== "") hunk.lines.push(line);
      continue;
    }
  }
  push();
  return files.filter((f) => f.path !== "");
}

/** Attach numstat counts (and binary flags) to parsed files, by path. */
export function mergeDiffStats(files: GitDiffFile[], numstat: GitNumstatEntry[]): GitDiffFile[] {
  const byPath = new Map(numstat.map((n) => [n.path, n]));
  return files.map((file) => {
    const stat = byPath.get(file.path);
    if (!stat) {
      const counted = countDiffLines(file);
      return { ...file, additions: counted.additions, deletions: counted.deletions };
    }
    return {
      ...file,
      origPath: file.origPath ?? stat.origPath,
      additions: stat.additions,
      deletions: stat.deletions,
      binary: file.binary || stat.binary,
      status: file.status === "modified" && stat.binary ? "binary" : file.status,
    };
  });
}
