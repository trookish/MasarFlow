import { BrowserWindow, shell } from "electron";
import { join } from "node:path";
import { APP_ORIGIN, LANDING_PATH } from "@shared/security";
import { isInternalUrl, isSafeExternalUrl } from "../security/url-policy";
import { ptyManager } from "../pty";

export interface MainWindowOptions {
  /** Set only in `pnpm dev:desktop`: the Next dev server URL. */
  devUrl?: string;
  onClose: (e: Electron.Event) => void;
}

export function createMainWindow(opts: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: "#0a0a0c",
    icon: join(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });

  const guard = (e: Electron.Event, url: string): void => {
    if (isInternalUrl(url, opts.devUrl)) return;
    e.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  };
  win.webContents.on("will-navigate", (e, url) => guard(e, url));
  win.webContents.on("will-redirect", (e, url) => guard(e, url));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternalUrl(url, opts.devUrl) && isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  win.once("ready-to-show", () => win.show());
  win.on("close", opts.onClose);
  // A closed window takes its shells with it: terminal sessions only make
  // sense while the workspace is open (P8.T12).
  win.on("closed", () => ptyManager.killAll());
  // Boot straight into the canonical landing page. Loading "/" went through two
  // client redirects ("/" -> "/dashboard" -> "/today?view=dashboard"), and the
  // last one could commit after the user's first sidebar click and undo it.
  void win.loadURL(opts.devUrl ?? `${APP_ORIGIN}${LANDING_PATH}`);
  return win;
}
