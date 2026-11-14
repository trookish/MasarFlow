import { app, BrowserWindow, dialog, Menu, nativeImage, session, shell, Tray } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { closeBehavior } from "@shared/window-behavior";
import { installAppProtocol, registerAppScheme } from "./backend/protocol";
import { startBackend, type BackendHandle } from "./backend/server";
import { registerIpc } from "./ipc";
import { buildCsp } from "./security/csp";
import { isPermissionAllowed } from "./security/permissions";
import { settings } from "./settings";
import { installLogBuffer, logDir, pruneRotatedLogs, rotateServerLogs } from "./logging";
import { checkForUpdates, initUpdater } from "./updater";
import { sendToWindow } from "./window-send";
import { createMainWindow } from "./windows/main-window";

app.setName("MasarFlow");
installLogBuffer(); // P10.T7: main-process console output -> in-memory tail for diagnostics
registerAppScheme(); // must run before 'ready'

const DEV_URL = process.env.MASARFLOW_DEV_URL?.trim() || undefined;
const SMOKE = process.env.MASARFLOW_SMOKE === "1";
if (DEV_URL) app.setPath("userData", join(app.getPath("appData"), "MasarFlow-dev"));

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backend: BackendHandle | null = null;
let quitting = false;

/**
 * Tray menu v2 (P10.T11 + P10.T9): Open / Control Center / check for updates /
 * logs / hide-on-close / Quit. Rebuilt whenever the hide-on-close checkbox
 * changes so the tick matches the persisted setting.
 */
function rebuildTrayMenu(): void {
  if (!tray) return;
  const hideOnClose = Boolean(settings.get().closeToTray);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open MasarFlow", click: showWindow },
      { type: "separator" },
      { label: "Control Center", click: () => sendWindowRoute("/control-center") },
      { label: "Check for updates…", click: () => void checkForUpdates(() => mainWindow) },
      { label: "Open logs folder", click: () => void shell.openPath(logDir()) },
      { type: "separator" },
      {
        label: "Hide on close (keep running in the notification area)",
        type: "checkbox",
        checked: hideOnClose,
        click: (item) => {
          settings.set({ closeToTray: item.checked });
          rebuildTrayMenu();
        },
      },
      { type: "separator" },
      { label: "Quit MasarFlow", click: () => app.quit() },
    ]),
  );
}

function createTray(): void {
  const icon = nativeImage
    .createFromPath(join(__dirname, "../../resources/icon.png"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("MasarFlow");
  rebuildTrayMenu();
  tray.on("click", () => showWindow());
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Focus the window and ask the renderer to navigate (the shell listens for this). */
function sendWindowRoute(route: string): void {
  showWindow();
  sendToWindow(mainWindow, CH.appNavigate, route);
}

const SMOKE_ROOT = process.platform === "win32" ? "C:\\msf-smoke-unregistered" : "/msf-smoke-unregistered";

/** Smoke mode: prove the packaged app boots the workspace, report to a file, exit. */
function runSmoke(win: BrowserWindow): void {
  const out = process.env.MASARFLOW_SMOKE_OUT ?? "";
  const finish = (payload: object, code: number): void => {
    if (out) writeFileSync(out, JSON.stringify(payload));
    app.exit(code);
  };
  const timer = setTimeout(() => finish({ ok: false, error: "timeout waiting for the landing page" }, 1), 90_000);
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
            hasUpdater: typeof window.masarflow?.updater?.check === "function",
            guard: { status: r.status, error: String(j.error || "") },
          };
        })()`,
      );
      if (String(info.path).startsWith("/today")) {
        clearTimeout(timer);
        // The POST must get past the guard (token + Host + Origin) and be refused by the ROOT allow-list.
        const guardOk = info.guard.status === 403 && /not been linked/.test(info.guard.error);
        // Denial proof: a direct request to the app's own loopback port without the
        // launch token must be refused (the renderer only ever talks to the app protocol).
        const unauthed = await fetch(`${backend?.origin ?? ""}/api/health`).catch(() => null);
        const denial = { status: unauthed?.status ?? 0 };
        const deniedOk = denial.status === 401 || denial.status === 403;
        finish({ ok: guardOk && deniedOk, ...info, denial }, guardOk && deniedOk ? 0 : 1);
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
    onClose: (e) => {
      // `quitting` is set by before-quit / app.quit paths; a plain window close
      // follows the user's close-to-tray preference, which defaults to OFF.
      if (closeBehavior({ closeToTray: Boolean(settings.get().closeToTray), quitting }) === "hide") {
        e.preventDefault();
        mainWindow?.hide();
      } else {
        quitting = true;
      }
    },
  });
  mainWindow.on("maximize", () => sendToWindow(mainWindow, CH.winMaximized, true));
  mainWindow.on("unmaximize", () => sendToWindow(mainWindow, CH.winMaximized, false));
  if (SMOKE) runSmoke(mainWindow);
  else {
    createTray();
    // P10.T9: wire the updater once the window exists. The launch check is a
    // plain timeout that cannot slow the start-up path, runs only for installed
    // builds, and never in smoke mode (which must stay offline and fast) or
    // under the packaged e2e harness (MASARFLOW_E2E=1), which must not reach github.com.
    initUpdater(() => mainWindow);
    if (app.isPackaged && !process.env.MASARFLOW_UPDATER_DEV_FEED && process.env.MASARFLOW_E2E !== "1") {
      setTimeout(() => void checkForUpdates(() => mainWindow), 15_000);
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    // App settings (P10.T1): launcher-settings.json under userData. Nothing
    // initialised this store before P10 — it was carried over from the launcher
    // without a caller, so settings.get()/set() would have been no-ops on disk.
    settings.init();
    // Log rotation (P10.T7 / P8's R-P8-5): the app-server child appends to
    // logs/server.log — rotate + prune before it spawns so no file is written
    // by two processes at once, and long-running installs stop growing forever.
    rotateServerLogs();
    pruneRotatedLogs();
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
