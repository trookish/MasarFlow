/**
 * Logs IPC: the Logs panel lists and tails the app's own log directory. The
 * directory comes from Electron, never from the renderer, and file names are
 * validated (safeLogName) — this channel cannot read arbitrary files.
 */

import { app, ipcMain, type BrowserWindow } from "electron";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { listLogs, readLogTail } from "../logs";

export function registerLogsIpc(_getWindow: () => BrowserWindow | null): void {
  const logsDir = (): string => join(app.getPath("userData"), "logs");

  ipcMain.handle(CH.logsList, () => listLogs(logsDir()));

  ipcMain.handle(CH.logsTail, (_event, name: unknown, lines: unknown) =>
    readLogTail(logsDir(), name, typeof lines === "number" ? lines : 200),
  );
}
