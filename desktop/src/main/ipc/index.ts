import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { isRootAllowed } from "@shared/roots";
import { addRootToFile, readRootsFile } from "../security/roots";
import { isSafeExternalUrl } from "../security/url-policy";
import { SecretStore, createSafeStorageCodec, isValidSecretKey } from "../secrets";
import { listBackups, readBackup, writeBackup } from "../backups";

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
}
