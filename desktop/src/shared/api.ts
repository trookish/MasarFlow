import type { GitBranchInfo, GitCommitInfo, GitDiffFile, GitRepoStatus, GitResult } from "./git";

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
}
