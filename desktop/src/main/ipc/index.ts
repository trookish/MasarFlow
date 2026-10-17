import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { isSafeExternalUrl } from "../security/url-policy";

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

  ipcMain.handle(CH.dialogChooseFolder, async () => {
    const w = win();
    const res = w
      ? await dialog.showOpenDialog(w, { properties: ["openDirectory", "createDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
  });

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
}
