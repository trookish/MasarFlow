import type { GitFailureCode } from "@shared/git";

/**
 * Pure half of the git runner: argv construction, version parsing, binary
 * discovery, failure classification. The only file that spawns processes is
 * ./exec.ts, which keeps every test here deterministic (no git needed).
 *
 * Verified on this machine: git 2.53.0.windows.3 (git-bash bundle) and native
 * Git for Windows 2.45.1 both accept the prelude below and print identical
 * porcelain v2 / numstat -z / unified diff output.
 */

export const GIT_TIMEOUT_MS = 60_000;
export const GIT_MAX_OUTPUT = 8 * 1024 * 1024;

/** Commands where exit code 1 means "differences found" — a normal result. */
export const DIFF_EXIT_CODES: readonly number[] = [0, 1];

export interface GitInvocation {
  binary: string;
  /** Full argv after the prelude. */
  args: string[];
  cwd: string;
  timeoutMs: number;
}

export interface GitRawRun {
  /** Process exit code, or null when the process could not start / was killed. */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Node errno when the spawn itself failed ("ENOENT", "EACCES", …). */
  errno?: string;
}

export type GitExec = (inv: GitInvocation) => Promise<GitRawRun>;

/**
 * `core.quotepath=false` keeps UTF-8 paths raw (`-z` output is raw either way);
 * `i18n.logOutputEncoding=UTF-8` keeps log bodies stable; no pager/color is
 * needed because there is no TTY.
 */
export function buildGitArgs(args: string[]): string[] {
  return [
    "-c", "core.quotepath=false",
    "-c", "i18n.logOutputEncoding=UTF-8",
    ...args,
  ];
}

export interface GitVersion {
  version: string;
  raw: string;
}

/** "git version 2.53.0.windows.3" -> { version: "2.53.0" }. */
export function parseGitVersion(stdout: string): GitVersion | null {
  const line = stdout.trim().split("\n")[0]?.trim() ?? "";
  const m = /^git version (\d+\.\d+(?:\.\d+)?)/.exec(line);
  return m ? { version: m[1], raw: line } : null;
}

/** Well-known install locations, tried in order after PATH. */
export const WIN_GIT_FALLBACKS: readonly string[] = [
  "C:\\Program Files\\Git\\cmd\\git.exe",
  "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
];

/**
 * Ordered candidate list for the git binary. `MASARFLOW_GIT_PATH` is a strict
 * override (portable installs, and how the failure matrix reproduces
 * "git-missing"): when it is set nothing else is tried. Otherwise PATH first,
 * then the well-known Windows install locations that actually exist on disk.
 */
export function candidateGitBinaries(
  env: { MASARFLOW_GIT_PATH?: string },
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
): string[] {
  const override = env.MASARFLOW_GIT_PATH?.trim();
  if (override) return [override];
  const out: string[] = ["git"];
  if (platform === "win32") {
    for (const p of WIN_GIT_FALLBACKS) if (exists(p)) out.push(p);
  }
  return out;
}

const RULES: Array<{ code: GitFailureCode; re: RegExp }> = [
  { code: "not-a-repo", re: /not a git repository/i },
  { code: "index-locked", re: /index\.lock|Another git process/i },
  { code: "nothing-to-commit", re: /nothing to commit|no changes added to commit/i },
  { code: "no-remote", re: /No such remote|does not appear to be a git repository/i },
  {
    code: "invalid-input",
    re: /invalid reference|not a valid branch name|did not match any file|unknown revision|ambiguous argument|Pathspec/i,
  },
  { code: "permission-denied", re: /permission denied|access is denied|unable to create file/i },
];

/** Last non-empty stderr line, clipped — the diagnostic the UI shows under the friendly copy. */
export function lastStderrLine(stderr: string): string {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return last.length > 300 ? `${last.slice(0, 299)}…` : last;
}

/**
 * Typed failure for a finished run, or null when the run counts as success.
 * `accepted` defaults to [0]; diff commands pass DIFF_EXIT_CODES.
 */
export function classifyGitFailure(
  raw: GitRawRun,
  accepted: readonly number[] = [0],
): GitFailureCode | null {
  if (raw.errno === "ENOENT") return "git-missing";
  if (raw.errno === "EACCES" || raw.errno === "EPERM") return "permission-denied";
  if (raw.timedOut) return "timeout";
  if (raw.code === null) return "unknown";
  if (accepted.includes(raw.code)) return null;
  if (raw.errno) return "unknown";
  for (const rule of RULES) if (rule.re.test(raw.stderr)) return rule.code;
  return "unknown";
}
