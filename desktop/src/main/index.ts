import { app, BrowserWindow, dialog, Menu, nativeImage, session, shell, Tray } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { installAppProtocol, registerAppScheme } from "./backend/protocol";
import { startBackend, type BackendHandle } from "./backend/server";
import { registerIpc } from "./ipc";
import { buildCsp } from "./security/csp";
import { isPermissionAllowed } from "./security/permissions";
import { createMainWindow } from "./windows/main-window";

app.setName("MasarFlow");
registerAppScheme(); // must run before 'ready'

const DEV_URL = process.env.MASARFLOW_DEV_URL?.trim() || undefined;
const SMOKE = process.env.MASARFLOW_SMOKE === "1";
if (DEV_URL) app.setPath("userData", join(app.getPath("appData"), "MasarFlow-dev"));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backend: BackendHandle | null = null;
let quitting = false;

function createTray(): void {
  const icon = nativeImage
    .createFromPath(join(__dirname, "../../resources/icon.png"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("MasarFlow");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open MasarFlow", click: () => showWindow() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => showWindow());
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

const SMOKE_ROOT = process.platform === "win32" ? "C:\\msf-smoke-unregistered" : "/msf-smoke-unregistered";

/** Smoke mode: prove the packaged app boots the workspace, report to a file, exit. */
function runSmoke(win: BrowserWindow): void {
  const out = process.env.MASARFLOW_SMOKE_OUT ?? "";
  const finish = (payload: object, code: number): void => {
    if (out) writeFileSync(out, JSON.stringify(payload));
    app.exit(code);
  };
  const timer = setTimeout(() => finish({ ok: false, error: "timeout waiting for /dashboard" }, 1), 90_000);
  win.webContents.on("did-finish-load", async () => {
    try {
      const info = await win.webContents.executeJavaScript(
        `(async () => {
          const r = await fetch("/api/fs/list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ root: ${JSON.stringify(SMOKE_ROOT)}, path: "" }),
          });
          const j = await r.json().catch(() => ({}));
          return {
            path: location.pathname,
            origin: location.origin,
            hasApi: typeof window.masarflow === "object",
            guard: { status: r.status, error: String(j.error || "") },
          };
        })()`,
      );
      if (String(info.path).startsWith("/dashboard")) {
        clearTimeout(timer);
        // The POST must get past the guard (token + Host + Origin) and be refused by the ROOT allow-list.
        const guardOk = info.guard.status === 403 && /not been linked/.test(info.guard.error);
        finish({ ok: guardOk, ...info }, guardOk ? 0 : 1);
      }
    } catch (e) {
      finish({ ok: false, error: String(e) }, 1);
    }
  });
}

async function boot(): Promise<void> {
  try {
    if (!DEV_URL) {
      const serverEntry = app.isPackaged
        ? join(process.resourcesPath, "app-server", "server.js")
        : join(__dirname, "../../app-server/server.js");
      backend = await startBackend({
        serverEntry,
        logDir: join(app.getPath("userData"), "logs"),
        env: { MASARFLOW_DATA_DIR: app.getPath("userData"), MASARFLOW_VERSION: app.getVersion() },
      });
      installAppProtocol({ target: backend.origin, token: backend.token });
    }
  } catch (e) {
    const choice = dialog.showMessageBoxSync({
      type: "error",
      title: "MasarFlow could not start",
      message: "The local workspace service failed to start.",
      detail: String((e as Error).message ?? e).slice(0, 1500),
      buttons: ["Open logs folder", "Quit"],
      defaultId: 1,
    });
    if (choice === 0) await shell.openPath(join(app.getPath("userData"), "logs"));
    app.exit(1);
    return;
  }

  registerIpc(() => mainWindow);
  mainWindow = createMainWindow({
    devUrl: DEV_URL,
    onClose: () => {
      quitting = true; // close = quit; the tray "hide on close" option arrives in P10
    },
  });
  mainWindow.on("maximize", () => mainWindow?.webContents.send(CH.winMaximized, true));
  mainWindow.on("unmaximize", () => mainWindow?.webContents.send(CH.winMaximized, false));
  if (SMOKE) runSmoke(mainWindow);
  else createTray();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    // Hardening: deny-by-default permissions; in dev the Next dev server needs
    // eval and its HMR websocket, so it gets a looser CSP than the packaged app.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(isPermissionAllowed(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => isPermissionAllowed(permission));
    if (DEV_URL) {
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [buildCsp({ dev: true })] } });
      });
    }
    void boot();
  });
  app.on("web-contents-created", (_e, contents) => contents.on("will-attach-webview", (ev) => ev.preventDefault()));
  app.on("before-quit", () => {
    quitting = true;
    void backend?.stop();
  });
  app.on("window-all-closed", () => {
    if (quitting || process.platform !== "darwin") app.quit();
  });
}
