import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { CH } from "@shared/channels";
import {
  allowedPrerelease,
  initialUpdaterStatus,
  isUpdatableBuild,
  reduceUpdaterEvent,
  type UpdateChannel,
  type UpdaterEvent,
  type UpdaterStatus,
} from "@shared/updater-status";
import { settings } from "./settings";
import { logLine } from "./logging";

let status: UpdaterStatus = initialUpdaterStatus(app.getVersion());

export function updaterSnapshot(): UpdaterStatus {
  return status;
}

function emit(event: UpdaterEvent, win: () => BrowserWindow | null): UpdaterStatus {
  status = reduceUpdaterEvent(status, event);
  win()?.webContents.send(CH.updaterStatus, status);
  return status;
}

/**
 * P10.T10 — local update-path proof: `MASARFLOW_UPDATER_DEV_FEED=1` forces
 * electron-updater's dev mode (forceDevUpdateConfig) against a feed config we
 * point at ourselves. Used only by desktop/scripts/proof-update-local.mjs; a
 * shipped build never sets it.
 */
function devFeedConfigPath(): string | null {
  if (process.env.MASARFLOW_UPDATER_DEV_FEED !== "1") return null;
  return process.env.MASARFLOW_UPDATER_FEED_FILE?.trim() || join(app.getAppPath(), "dev-app-update.yml");
}

/** Wire electron-updater once, after the window exists. */
export function initUpdater(win: () => BrowserWindow | null): void {
  const appSettings = settings.get();
  const devFeed = devFeedConfigPath();
  const updatable =
    devFeed !== null ||
    isUpdatableBuild({ packaged: app.isPackaged, portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR) });
  if (!updatable) {
    status = reduceUpdaterEvent(status, {
      type: "disabled",
      reason: app.isPackaged
        ? "The portable build cannot update itself — download the new version from the releases page."
        : "Development build — updates are disabled.",
    });
    return;
  }
  if (devFeed !== null) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.updateConfigPath = devFeed;
  }
  autoUpdater.autoDownload = false; // explicit: the user presses Download (master §3 Q6: no silent bandwidth)
  autoUpdater.autoInstallOnAppQuit = true; // "install on next quit" stays the default path
  autoUpdater.allowPrerelease = allowedPrerelease(appSettings.updateChannel as UpdateChannel);
  autoUpdater.logger = {
    // electron-updater's Logger is exactly { info, warn, error, debug? }
    // (out/types.d.ts:8-13); no cast needed.
    info: (m) => logLine("updater", String(m)),
    warn: (m) => logLine("updater", String(m)),
    error: (m) => logLine("updater", String(m)),
    debug: (m) => logLine("updater", m),
  };

  autoUpdater.on("checking-for-update", () => emit({ type: "checking" }, win));
  autoUpdater.on("update-not-available", () => emit({ type: "not-available" }, win));
  autoUpdater.on("update-available", (info: UpdateInfo) => emit({ type: "available", version: info.version }, win));
  autoUpdater.on("download-progress", (p: { percent: number }) => emit({ type: "progress", percent: p.percent }, win));
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => emit({ type: "downloaded", version: info.version }, win));
  autoUpdater.on("error", (e: Error) => emit({ type: "error", message: e.message.split("\n")[0]!.slice(0, 200) }, win));
}

export async function checkForUpdates(win: () => BrowserWindow | null): Promise<UpdaterStatus> {
  if (status.phase === "disabled") return status;
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) }, win);
  }
  return status;
}

export async function downloadUpdate(win: () => BrowserWindow | null): Promise<UpdaterStatus> {
  if (status.phase === "disabled") return status;
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    emit({ type: "error", message: e instanceof Error ? e.message : String(e) }, win);
  }
  return status;
}

/** Restart now: install and relaunch. `isSilent=false`, `isForceRunAfter=true`. */
export function installUpdateNow(): void {
  autoUpdater.quitAndInstall(false, true);
}

/** Re-read the channel preference and apply it without a restart. */
export function applyChannel(channel: UpdateChannel): void {
  autoUpdater.allowPrerelease = allowedPrerelease(channel);
}
