import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { isRootAllowed } from "@shared/roots";
import { addRootToFile, readRootsFile } from "../security/roots";
import { isSafeExternalUrl } from "../security/url-policy";
import { SecretStore, createSafeStorageCodec, isValidSecretKey } from "../secrets";
import { listBackups, readBackup, writeBackup } from "../backups";
import { createExecGit } from "../git/exec";
import { createGitService } from "../git/service";

const DISPLAY_VERSION = "0.2.0.0"; // single source for UI; package.json holds the semver

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const win = (): BrowserWindow | null => getWindow();

  ipcMain.handle(CH.appInfo, () => ({
    version: app.getVersion(),
    displayVersion: DISPLAY_VERSION,
    userData: app.getPath("userData"),
    packaged: app.isPackaged,
  }));
  ipcMain.handle(CH.appOpenLogs, () => shell.openPath(join(app.getPath("userData"), "logs")));
  ipcMain.on(CH.appRelaunch, () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle(CH.dialogChooseFolder, async (_e, defaultPath?: string) => {
    const w = win();
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      defaultPath: typeof defaultPath === "string" ? defaultPath : undefined,
    };
    const res = w ? await dialog.showOpenDialog(w, options) : await dialog.showOpenDialog(options);
    if (res.canceled || res.filePaths.length === 0) return null;
    const picked = res.filePaths[0];
    // Every folder chosen through the native picker becomes an allowed root for the server.
    addRootToFile(join(app.getPath("userData"), "roots.json"), picked);
    return picked;
  });

  ipcMain.handle(CH.rootsList, () => readRootsFile(join(app.getPath("userData"), "roots.json")));
  ipcMain.handle(CH.rootsCovers, (_e, p: unknown) =>
    typeof p === "string" && isRootAllowed(p, readRootsFile(join(app.getPath("userData"), "roots.json"))),
  );

  ipcMain.handle(CH.shellOpenExternal, (_e, url: string) => {
    if (typeof url === "string" && isSafeExternalUrl(url)) return shell.openExternal(url);
    return undefined;
  });
  ipcMain.on(CH.shellShowItem, (_e, p: string) => {
    if (typeof p === "string") shell.showItemInFolder(p);
  });

  ipcMain.handle(CH.clipboardWrite, (_e, text: string) => clipboard.writeText(String(text)));
  ipcMain.handle(CH.clipboardRead, () => clipboard.readText());

  ipcMain.on(CH.winMinimize, () => win()?.minimize());
  ipcMain.on(CH.winToggleMax, () => {
    const w = win();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.on(CH.winClose, () => win()?.close());
  ipcMain.handle(CH.winIsMax, () => win()?.isMaximized() ?? false);

  // Secrets are encrypted with the OS keychain (DPAPI / Keychain / libsecret)
  // and never leave the main process except over these validated channels.
  const secrets = new SecretStore(join(app.getPath("userData"), "secrets.json"), createSafeStorageCodec(safeStorage));
  const checkedKey = (key: unknown): string => {
    if (typeof key !== "string" || !isValidSecretKey(key)) throw new Error("Invalid secret key");
    return key;
  };
  ipcMain.handle(CH.secretsAvailable, () => secrets.available());
  ipcMain.handle(CH.secretsGet, (_e, key: unknown) => secrets.get(checkedKey(key)));
  ipcMain.handle(CH.secretsSet, (_e, key: unknown, value: unknown) => {
    if (typeof value !== "string") throw new Error("Invalid secret value");
    secrets.set(checkedKey(key), value);
  });
  ipcMain.handle(CH.secretsDelete, (_e, key: unknown) => secrets.delete(checkedKey(key)));

  // Automatic backups: gzipped JSON under userData/backups. Only file names
  // matching the app's own pattern are ever read back.
  const backupsDir = (): string => join(app.getPath("userData"), "backups");
  ipcMain.handle(CH.backupsWrite, (_e, json: unknown) => {
    if (typeof json !== "string" || json.length >= 512 * 1024 * 1024) throw new Error("Invalid backup payload");
    return writeBackup(backupsDir(), json);
  });
  ipcMain.handle(CH.backupsList, () => listBackups(backupsDir()));
  ipcMain.handle(CH.backupsRead, (_e, name: unknown) => {
    if (typeof name !== "string") throw new Error("Invalid backup name");
    return readBackup(backupsDir(), name);
  });
  ipcMain.handle(CH.backupsOpenFolder, async () => {
    mkdirSync(backupsDir(), { recursive: true });
    await shell.openPath(backupsDir());
  });

  /* ── Git (P6) — main-process only, registered roots only ─────────────── */
  const rootsFile = (): string => join(app.getPath("userData"), "roots.json");
  const git = createGitService({
    exec: createExecGit(),
    roots: () => readRootsFile(rootsFile()),
  });
  const asPath = (v: unknown): string => (typeof v === "string" ? v : "");
  const asPaths = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];
  type DiffLogOpts = { staged?: boolean; path?: string; untracked?: boolean; limit?: number };
  const asOpts = (v: unknown): DiffLogOpts => (typeof v === "object" && v !== null ? (v as DiffLogOpts) : {});

  ipcMain.handle(CH.gitAvailable, () => git.available());
  ipcMain.handle(CH.gitStatus, (_e, root: unknown) => git.status(asPath(root)));
  ipcMain.handle(CH.gitDiff, (_e, root: unknown, opts: unknown) => git.diff(asPath(root), asOpts(opts)));
  ipcMain.handle(CH.gitStage, (_e, root: unknown, paths: unknown) => git.stage(asPath(root), asPaths(paths)));
  ipcMain.handle(CH.gitUnstage, (_e, root: unknown, paths: unknown) => git.unstage(asPath(root), asPaths(paths)));
  ipcMain.handle(CH.gitCommit, (_e, root: unknown, opts: unknown) =>
    git.commit(asPath(root), { message: String((opts as { message?: unknown })?.message ?? "") }),
  );
  ipcMain.handle(CH.gitLog, (_e, root: unknown, opts: unknown) => git.log(asPath(root), asOpts(opts)));
  ipcMain.handle(CH.gitBranches, (_e, root: unknown) => git.branches(asPath(root)));
  ipcMain.handle(CH.gitSwitchBranch, (_e, root: unknown, name: unknown) => git.switchBranch(asPath(root), String(name ?? "")));
  ipcMain.handle(CH.gitCreateBranch, (_e, root: unknown, name: unknown, checkout: unknown) =>
    git.createBranch(asPath(root), String(name ?? ""), checkout !== false),
  );
  ipcMain.handle(CH.gitInit, (_e, root: unknown) => git.init(asPath(root)));
  ipcMain.handle(CH.gitRemote, (_e, root: unknown) => git.remote(asPath(root)));
}
