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
    /** Native folder picker. Returns the absolute path or null when cancelled. */
    chooseFolder(): Promise<string | null>;
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
}
