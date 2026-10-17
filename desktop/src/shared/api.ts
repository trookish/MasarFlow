import type { GitBranchInfo, GitCommitInfo, GitDiffFile, GitRepoStatus, GitResult } from "./git";
import type { EnvRow } from "./redact";
import type { P10Settings } from "./app-settings";
import type { SessionInfo } from "./types";

/**
 * Same union as `NodeJS.Platform` (see @types/node process.d.ts), declared locally so this
 * file also compiles under the renderer tsconfig, which does not load Node's global types.
 */
export type Platform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

/** The renderer-facing API exposed as `window.masarflow` by the preload script. */
export interface MasarflowApi {
  platform: Platform;
  app: {
    info(): Promise<{ version: string; displayVersion: string; userData: string; packaged: boolean }>;
    /** MasarFlow's own environment (whitelisted keys), secret values already redacted in main. */
    env(): Promise<EnvRow[]>;
    openLogs(): Promise<void>;
    relaunch(): void;
  };
  dialog: {
    /** Native folder picker; the chosen folder is registered as an allowed root. */
    chooseFolder(defaultPath?: string): Promise<string | null>;
  };
  roots: {
    list(): Promise<string[]>;
    /** True when `path` is a registered root or inside one. */
    covers(path: string): Promise<boolean>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
    showItemInFolder(path: string): void;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
    readText(): Promise<string>;
  };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximized(cb: (maximized: boolean) => void): () => void;
  };
  secrets: {
    available(): Promise<boolean>;
    get(key: string): Promise<string>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  backups: {
    write(json: string): Promise<{ name: string; mtimeMs: number }>;
    list(): Promise<Array<{ name: string; mtimeMs: number }>>;
    read(name: string): Promise<string>;
    openFolder(): Promise<void>;
  };
  git: {
    available(): Promise<GitResult<{ version: string; raw: string; binary: string }>>;
    status(root: string): Promise<GitResult<GitRepoStatus>>;
    diff(root: string, options?: { staged?: boolean; path?: string; untracked?: boolean }): Promise<GitResult<GitDiffFile[]>>;
    stage(root: string, paths: string[]): Promise<GitResult<null>>;
    unstage(root: string, paths: string[]): Promise<GitResult<null>>;
    commit(root: string, options: { message: string }): Promise<GitResult<{ sha: string }>>;
    log(root: string, options?: { limit?: number; path?: string }): Promise<GitResult<GitCommitInfo[]>>;
    branches(root: string): Promise<GitResult<GitBranchInfo[]>>;
    switchBranch(root: string, name: string): Promise<GitResult<null>>;
    createBranch(root: string, name: string, checkout?: boolean): Promise<GitResult<null>>;
    init(root: string): Promise<GitResult<null>>;
    remote(root: string): Promise<GitResult<{ url: string } | null>>;
  };
  terminal: {
    /** Start a shell inside a registered root. Refused by the main process otherwise. */
    start(input: {
      cwd: string;
      cols?: number;
      rows?: number;
    }): Promise<{ ok: true; session: SessionInfo } | { ok: false; error: string }>;
    list(): Promise<SessionInfo[]>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): Promise<boolean>;
    /** Everything the session printed, for re-attach after a reload. */
    buffer(id: string): Promise<string>;
    clear(id: string): Promise<void>;
    onOutput(cb: (payload: { id: string; data: string }) => void): () => void;
    onExit(cb: (payload: { id: string; exitCode: number | null }) => void): () => void;
  };
  logs: {
    list(): Promise<{ name: string; bytes: number; modifiedAt: number }[]>;
    tail(name: string, lines?: number): Promise<string[]>;
  };
  settings: {
    /** The full main-process settings object (AppSettings). */
    get(): Promise<Record<string, unknown>>;
    /** Merge a partial patch; returns the settings after the merge. */
    set(patch: Partial<P10Settings>): Promise<Record<string, unknown>>;
  };
}
