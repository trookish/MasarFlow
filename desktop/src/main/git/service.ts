import type { GitBranchInfo, GitCommitInfo, GitDiffFile, GitFailureCode, GitRepoStatus, GitResult } from "@shared/git";
import { isRootAllowed } from "@shared/roots";
import {
  DIFF_EXIT_CODES,
  GIT_TIMEOUT_MS,
  buildGitArgs,
  classifyGitFailure,
  lastStderrLine,
  parseGitVersion,
  type GitExec,
} from "./run";
import { parseStatusPorcelainV2 } from "./parse-status";
import { BRANCH_FORMAT, LOG_FORMAT, parseBranchList, parseCommitLog, parseRemoteUrl } from "./parse-refs";
import { mergeDiffStats, parseNumstatZ, parseUnifiedDiff } from "./parse-diff";

/**
 * The git service. Every method takes a repository root that must be inside a
 * folder the user registered through the native picker (roots.json, re-read on
 * every call so revoking access is immediate). Nothing here throws: failures
 * come back as typed codes (D-P6-5) and never as exceptions across IPC.
 */

export interface GitServiceDeps {
  exec: GitExec;
  /** Current allow-list read from roots.json at call time. */
  roots: () => string[];
  platform?: NodeJS.Platform;
  binary?: string;
  timeoutMs?: number;
}

export interface GitDiffOptions {
  /** Diff the index instead of the worktree. */
  staged?: boolean;
  /** Repo-root-relative path to limit the diff to. */
  path?: string;
  /** Diff an untracked file against /dev/null (--no-index). */
  untracked?: boolean;
}

/** Serializes callbacks (one git mutation at a time → no .git/index.lock races). */
export function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.then(fn, fn);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

const MAX_LOG = 200;

export function createGitService(deps: GitServiceDeps) {
  const platform = deps.platform ?? process.platform;
  const binary = deps.binary ?? "git";
  const timeoutMs = deps.timeoutMs ?? GIT_TIMEOUT_MS;
  const withLock = createMutex();

  const err = (code: GitFailureCode, message: string): GitResult<never> => ({ ok: false, code, message });

  function assertAllowed(root: string): GitResult<never> | null {
    if (!root) return err("root-not-allowed", "No folder selected");
    if (!isRootAllowed(root, deps.roots(), platform)) {
      return err("root-not-allowed", `${root} is not a linked folder`);
    }
    return null;
  }

  async function run(
    root: string,
    args: string[],
    accepted: readonly number[] = [0],
  ): Promise<{ raw: Awaited<ReturnType<GitExec>>; failure: GitFailureCode | null }> {
    const raw = await deps.exec({
      binary,
      args: buildGitArgs(args),
      cwd: root,
      timeoutMs,
    });
    return { raw, failure: classifyGitFailure(raw, accepted) };
  }

  /** Shared body: validate root → run → classify → parse. */
  async function op<T>(
    root: string,
    args: string[],
    parse: (stdout: string) => T,
    accepted: readonly number[] = [0],
  ): Promise<GitResult<T>> {
    const denied = assertAllowed(root);
    if (denied) return denied;
    const { raw, failure } = await run(root, args, accepted);
    if (failure) return err(failure, lastStderrLine(raw.stderr) || failure);
    return { ok: true, data: parse(raw.stdout) };
  }

  async function mutate(root: string, args: string[]): Promise<GitResult<null>> {
    const denied = assertAllowed(root);
    if (denied) return denied;
    return withLock(async () => {
      const { raw, failure } = await run(root, args);
      if (failure) return err(failure, lastStderrLine(raw.stderr) || failure);
      return { ok: true, data: null };
    });
  }

  return {
    /** Probe the binary once per panel mount. */
    async available(): Promise<GitResult<{ version: string; raw: string; binary: string }>> {
      const raw = await deps.exec({ binary, args: ["--version"], cwd: deps.roots()[0] ?? process.cwd(), timeoutMs: 10_000 });
      const failure = classifyGitFailure(raw);
      if (failure) return err(failure, lastStderrLine(raw.stderr) || failure);
      const version = parseGitVersion(raw.stdout);
      if (!version) return err("unknown", `Unrecognised git version output: ${raw.stdout.trim().slice(0, 120)}`);
      return { ok: true, data: { version: version.version, raw: version.raw, binary } };
    },

    status(root: string): Promise<GitResult<GitRepoStatus>> {
      return op(root, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"], parseStatusPorcelainV2);
    },

    async diff(root: string, options: GitDiffOptions = {}): Promise<GitResult<GitDiffFile[]>> {
      const { staged = false, path, untracked = false } = options;
      const scope = path ? ["--", path] : ["--"];
      const accepted = DIFF_EXIT_CODES;
      const textArgs = untracked
        ? ["diff", "--no-index", "--no-color", "--unified=3", "--", "/dev/null", path ?? ""]
        : [...(staged ? ["diff", "--cached"] : ["diff"]), "--no-color", "--unified=3", ...scope];
      const statArgs = untracked
        ? null
        : [...(staged ? ["diff", "--cached"] : ["diff"]), "--numstat", "-z", ...scope];

      const denied = assertAllowed(root);
      if (denied) return denied;
      const text = await run(root, textArgs, accepted);
      if (text.failure) return err(text.failure, lastStderrLine(text.raw.stderr) || text.failure);
      const files = parseUnifiedDiff(text.raw.stdout);
      if (!statArgs) {
        return { ok: true, data: mergeDiffStats(files, []) };
      }
      const stat = await run(root, statArgs, accepted);
      if (stat.failure) return err(stat.failure, lastStderrLine(stat.raw.stderr) || stat.failure);
      return { ok: true, data: mergeDiffStats(files, parseNumstatZ(stat.raw.stdout)) };
    },

    stage(root: string, paths: string[]): Promise<GitResult<null>> {
      if (!paths.length) return Promise.resolve(err("invalid-input", "No files selected"));
      return mutate(root, ["add", "--", ...paths]);
    },

    unstage(root: string, paths: string[]): Promise<GitResult<null>> {
      if (!paths.length) return Promise.resolve(err("invalid-input", "No files selected"));
      return mutate(root, ["restore", "--staged", "--", ...paths]);
    },

    commit(root: string, options: { message: string }): Promise<GitResult<{ sha: string }>> {
      const message = options.message ?? "";
      if (!message.trim()) return Promise.resolve(err("invalid-input", "Commit message is empty"));
      const denied = assertAllowed(root);
      if (denied) return Promise.resolve(denied);
      return withLock(async () => {
        const { raw, failure } = await run(root, ["commit", "-m", message]);
        if (failure) return err(failure, lastStderrLine(raw.stderr) || failure);
        // `git commit` prints `[<branch> <sha>] <subject>` (a short sha — verified
        // with git 2.53.0); read the hex run from the bracket line first, then
        // fall back to a bare hex run in case the format ever changes.
        const sha =
          raw.stdout.match(/\[[^\]]*\s([0-9a-f]{4,40})\]/)?.[1] ??
          raw.stdout.match(/[0-9a-f]{4,40}/)?.[0] ??
          "";
        return { ok: true, data: { sha } };
      });
    },

    log(root: string, options: { limit?: number; path?: string } = {}): Promise<GitResult<GitCommitInfo[]>> {
      const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_LOG);
      const args = ["log", `--max-count=${limit}`, `--format=${LOG_FORMAT}`, "--no-color", "--"];
      if (options.path) args.push(options.path);
      return op(root, args, parseCommitLog);
    },

    branches(root: string): Promise<GitResult<GitBranchInfo[]>> {
      return op(root, ["for-each-ref", `--format=${BRANCH_FORMAT}`, "refs/heads"], parseBranchList);
    },

    switchBranch(root: string, name: string): Promise<GitResult<null>> {
      if (!name.trim()) return Promise.resolve(err("invalid-input", "Branch name is empty"));
      return mutate(root, ["switch", name]);
    },

    async createBranch(root: string, name: string, checkout = true): Promise<GitResult<null>> {
      if (!name.trim()) return Promise.resolve(err("invalid-input", "Branch name is empty"));
      const denied = assertAllowed(root);
      if (denied) return denied;
      // git's own validator first — it is the only authority on valid refs.
      const check = await run(root, ["check-ref-format", "--branch", name]);
      if (check.failure) return err(check.failure, lastStderrLine(check.raw.stderr) || check.failure);
      return mutate(root, checkout ? ["switch", "-c", name] : ["branch", name]);
    },

    init(root: string): Promise<GitResult<null>> {
      return mutate(root, ["init"]);
    },

    async remote(root: string): Promise<GitResult<{ url: string } | null>> {
      const denied = assertAllowed(root);
      if (denied) return denied;
      const { raw } = await run(root, ["remote", "get-url", "origin"], [0, 2]);
      const url = parseRemoteUrl(raw.stdout || raw.stderr);
      return { ok: true, data: url ? { url } : null };
    },
  };
}

export type GitService = ReturnType<typeof createGitService>;
