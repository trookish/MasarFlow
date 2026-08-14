import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, join as pathJoin } from "node:path";
import type {
  AppSettings,
  EnvField,
  ServerStatus,
  SessionInfo,
  SetupState,
  StartSessionRequest,
} from "@shared/types";
import { saveEnv, readEnv, serializeFields, effectivePorts, clearRunPorts } from "./env";
import { ptyManager } from "./pty";
import { currentTargetDir, createSetupEngine } from "./setup";
import { settings } from "./settings";
import { startStatusPolling } from "./server-status";
import { maybeRunSelfTest } from "./selftest";
import { startGuiTest } from "./guitest";
import { checkForUpdates } from "./updates";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

/** The official MasarFlow repository — where a first-time setup gets the project. */
const MASARFLOW_REPO_URL =
  process.env.MASARFLOW_REPO_URL?.trim() || "https://github.com/trookish/MasarFlow.git";

/** Does this folder contain a MasarFlow project (package.json named "masarflow")? */
function isMasarFlowProject(dir: string): { ok: boolean; reason?: string } {
  const pkg = join(dir, "package.json");
  if (!existsSync(pkg)) {
    return { ok: false, reason: "No package.json in this folder — it doesn't look like a MasarFlow project." };
  }
  try {
    const name = (JSON.parse(readFileSync(pkg, "utf8")) as { name?: string }).name;
    if (name === "masarflow") return { ok: true };
    return {
      ok: false,
      reason: `"${name ?? "unknown"}" is not the MasarFlow project — MasarFlow requires the official project from GitHub.`,
    };
  } catch {
    return { ok: false, reason: "Invalid package.json — this doesn't look like the MasarFlow project." };
  }
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// ── run actions (shared by IPC and tray menu) ──────────────────────────────

function startDev(autoOpen: boolean): SessionInfo | null {
  const dir = currentTargetDir();
  ptyManager.killKind("run");
  const session = ptyManager.start({
    label: "npm run dev:full",
    kind: "run",
    command: "npm run dev:full",
    file: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    args: process.platform === "win32" ? ["/c", "npm run dev:full"] : ["-lc", "npm run dev:full"],
    cwd: dir,
  });
  if (autoOpen) {
    setTimeout(() => maybeOpenApp(), 8000);
  }
  return session;
}

function startProd(autoOpen: boolean): SessionInfo | null {
  const dir = currentTargetDir();
  ptyManager.killKind("run");
  const session = ptyManager.start({
    label: "npm start",
    kind: "run",
    command: "npm start",
    file: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    args: process.platform === "win32" ? ["/c", "npm start"] : ["-lc", "npm start"],
    cwd: dir,
  });
  if (autoOpen) {
    setTimeout(() => maybeOpenApp(), 8000);
  }
  return session;
}

function buildProject(): SessionInfo | null {
  ptyManager.killKind("build");
  return ptyManager.start({
    label: "npm run build",
    kind: "build",
    command: "npm run build",
    file: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    args: process.platform === "win32" ? ["/c", "npm run build"] : ["-lc", "npm run build"],
    cwd: currentTargetDir(),
  });
}

function stopRun(): void {
  ptyManager.killKind("run");
  // The force-killed start.mjs never runs its exit hooks — drop the stale
  // ports file so the chips fall back to the configured ports.
  clearRunPorts(currentTargetDir());
}

function maybeOpenApp(): void {
  const { appPort } = effectivePorts(currentTargetDir());
  void shell.openExternal(`http://127.0.0.1:${appPort}`);
}

function openBrowserIfUp(): void {
  if (lastStatus.app) {
    void shell.openExternal(`http://127.0.0.1:${lastStatus.appPort}`);
  }
}

function showLauncherWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** "Open …" tray items navigate the renderer to a launcher page. */
function navigateToPage(page: "run" | "setup" | "config" | "testing"): void {
  showLauncherWindow();
  send("ui:navigate", page);
}

function createTray(): void {
  const iconPath = pathJoin(__dirname, "../../resources/icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("MasarFlow Launcher");
  tray.on("click", showLauncherWindow);
  rebuildTrayMenu();
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  const appRunning = lastStatus.app;
  const menu = Menu.buildFromTemplate([
    { label: "Show launcher", click: showLauncherWindow },
    { type: "separator" },
    { label: "Run app (dev)", click: () => startDev(false) },
    { label: "Run app (prod)", click: () => startProd(false) },
    { label: "Stop app", click: stopRun },
    { label: "Build", click: buildProject },
    {
      label: appRunning ? "Open app in browser" : "Open app in browser (not running)",
      enabled: appRunning,
      click: openBrowserIfUp,
    },
    { type: "separator" },
    { label: "Open Setup", click: () => navigateToPage("setup") },
    { label: "Open Configuration", click: () => navigateToPage("config") },
    { label: "Open Testing", click: () => navigateToPage("testing") },
    { type: "separator" },
    { label: "Exit", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: "#0a0a0c",
    autoHideMenuBar: true,
    icon: pathJoin(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: pathJoin(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("maximize", () => send("window:maximized", true));
  mainWindow.on("unmaximize", () => send("window:maximized", false));

  // Close hides to the system tray instead of quitting — Exit lives in the
  // tray menu (right-click the icon).
  mainWindow.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow?.hide();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(pathJoin(__dirname, "../renderer/index.html"));
  }
}

function registerIpc(): void {
  // ── sessions ────────────────────────────────────────────────────────────
  ipcMain.handle("session:start", (_e, req: StartSessionRequest) => {
    return ptyManager.start(req);
  });
  ipcMain.handle("session:list", () => ptyManager.list());
  ipcMain.handle("session:buffer", (_e, id: string) => ptyManager.buffer(id));
  ipcMain.on("session:clear-buffer", (_e, id: string) => ptyManager.clearBuffer(id));
  ipcMain.on("session:input", (_e, payload: { id: string; data: string }) => {
    ptyManager.write(payload.id, payload.data);
  });
  ipcMain.on("session:resize", (_e, payload: { id: string; cols: number; rows: number }) => {
    ptyManager.resize(payload.id, payload.cols, payload.rows);
  });
  ipcMain.on("session:kill", (_e, id: string) => ptyManager.kill(id));

  ptyManager.on("output", (p) => send("session:output", p));
  ptyManager.on("exit", (p) => send("session:exit", p));
  ptyManager.on("changed", (info) => send("session:changed", info));

  // ── run (dev/prod) ──────────────────────────────────────────────────────
  ipcMain.handle("run:start-dev", (_e, opts: { autoOpen?: boolean }) =>
    startDev(opts?.autoOpen ?? false),
  );
  ipcMain.handle("run:start-prod", (_e, opts: { autoOpen?: boolean }) =>
    startProd(opts?.autoOpen ?? false),
  );
  ipcMain.handle("run:build", () => buildProject());
  ipcMain.handle("run:stop", () => stopRun());

  // ── setup / initialization ──────────────────────────────────────────────
  ipcMain.handle("setup:check", () => setupEngine.check(currentTargetDir()));
  ipcMain.handle("setup:run", () => setupEngine.run(currentTargetDir()));
  ipcMain.handle("setup:update", () => setupEngine.update(currentTargetDir()));

  // ── env / configuration ─────────────────────────────────────────────────
  ipcMain.handle("env:read", () => readEnv(currentTargetDir()));
  ipcMain.handle("env:save", (_e, fields: EnvField[]) =>
    saveEnv(currentTargetDir(), serializeFields(fields)),
  );
  ipcMain.handle("env:save-raw", (_e, content: string) =>
    saveEnv(currentTargetDir(), content),
  );

  // ── settings ────────────────────────────────────────────────────────────
  ipcMain.handle("settings:get", () => settings.get());
  ipcMain.handle("settings:set", (_e, patch: Partial<AppSettings>) => {
    const next = settings.set(patch);
    if (patch.targetDir) setupEngine.check(next.targetDir);
    return next;
  });
  ipcMain.handle("settings:mark-launched", () => settings.markLaunched());

  // ── assets ──────────────────────────────────────────────────────────────
  // The transparent launcher banner lives in the workspace's public/ folder
  // (single source of truth); serve it as a data URL so it works identically
  // from the dev server and the packaged file:// renderer.
  ipcMain.handle("assets:banner", (): string | null => {
    const file = join(currentTargetDir(), "public", "BannerNoBackground.png");
    if (!existsSync(file)) return null;
    try {
      return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
    } catch {
      return null;
    }
  });

  // ── status / server ─────────────────────────────────────────────────────
  ipcMain.handle("server:get-status", (): ServerStatus => lastStatus);

  // ── window ──────────────────────────────────────────────────────────────
  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:toggle-maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("window:close", () => mainWindow?.close());
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

  // ── clipboard (terminal copy/paste — reliable from the main process) ────
  ipcMain.handle("clipboard:write-text", (_e, text: string) => {
    clipboard.writeText(String(text ?? ""));
  });
  ipcMain.handle("clipboard:read-text", () => clipboard.readText());

  // ── misc ────────────────────────────────────────────────────────────────
  ipcMain.handle("shell:open-external", (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
    return shell.openPath(url);
  });
  ipcMain.handle("updates:check", () => checkForUpdates());
  ipcMain.handle("updates:open-release", (_e, url: string) => {
    if (/^https:\/\/github\.com\//.test(url)) return shell.openExternal(url);
    return undefined;
  });
  ipcMain.handle("dialog:choose-directory", async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Choose the MasarFlow project folder",
      properties: ["openDirectory"],
      defaultPath: currentTargetDir(),
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const dir = res.filePaths[0];
    const check = isMasarFlowProject(dir);
    return { path: dir, ok: check.ok, ...(check.reason ? { reason: check.reason } : {}) };
  });

  // Unvalidated folder picker — used to choose where to clone the project.
  ipcMain.handle("dialog:choose-folder", async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Choose where to clone the MasarFlow project",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  // ── github (first-time setup: get the MasarFlow project) ────────────────
  ipcMain.handle("github:repo-url", () => MASARFLOW_REPO_URL);

  ipcMain.handle("github:clone", (_e, parent: string) => {
    if (typeof parent !== "string" || !parent.trim()) {
      return { ok: false, error: "No destination folder chosen." };
    }
    const gitCheck = spawnSync("git", ["--version"], { encoding: "utf8", timeout: 10_000 });
    if (gitCheck.status !== 0) {
      return {
        ok: false,
        error: "git is not installed. Install git from https://git-scm.com and try again.",
      };
    }
    const dest = join(parent, "MasarFlow");
    const existing = isMasarFlowProject(dest);
    if (existing.ok) {
      // Already cloned — just point the launcher at it.
      return { ok: true, dest };
    }
    const session = ptyManager.start({
      label: "git clone MasarFlow",
      kind: "setup",
      command: `git clone ${MASARFLOW_REPO_URL} ${dest}`,
      file: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
      args:
        process.platform === "win32"
          ? ["/c", "git", "clone", "--progress", MASARFLOW_REPO_URL, dest]
          : ["-lc", `git clone --progress ${MASARFLOW_REPO_URL} ${dest}`],
      cwd: parent,
    });
    return { ok: true, dest, sessionId: session.id };
  });
}

const setupEngine = createSetupEngine((state: SetupState) => send("setup:state", state));
let lastStatus: ServerStatus = { app: false, python: false, appPort: 3000, pythonPort: 8000 };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    settings.init();
    setupEngine.init(currentTargetDir());
    void setupEngine.check(currentTargetDir());

    if (process.env.MASARFLOW_LAUNCHER_SELFTEST) {
      maybeRunSelfTest();
      return; // selftest drives its own lifecycle
    }

    registerIpc();
    createWindow();
    startGuiTest(mainWindow as BrowserWindow);
    createTray();

    const stopPolling = startStatusPolling(
      () => effectivePorts(currentTargetDir()),
      (status) => {
        lastStatus = status;
        send("server:status", status);
        rebuildTrayMenu();
      },
    );

    // When the renderer reloads, re-sync state it needs (sessions survive).
    app.on("web-contents-created", (_e, contents) => {
      contents.on("did-finish-load", () => {
        send("session:list", ptyManager.list());
        send("setup:state", setupEngine.getState());
        send("server:status", lastStatus);
        send("window:maximized", mainWindow?.isMaximized() ?? false);
      });
    });

    app.on("before-quit", () => {
      quitting = true;
      stopPolling();
      ptyManager.killAll();
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
