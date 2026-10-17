/**
 * Terminal IPC. THE security boundary of the tool panels: the renderer may
 * name a folder, this module decides whether a shell may run in it, and it
 * re-decides on every start (roots.json is re-read each time, so a root the
 * user removed stops working immediately).
 */

import { app, ipcMain, type BrowserWindow } from "electron";
import { join } from "node:path";
import { CH } from "@shared/channels";
import { resolveShell, validateTerminalStart } from "@shared/terminal";
import { readRootsFile } from "../security/roots";
import { ptyManager } from "../pty";

export function registerTerminalIpc(getWindow: () => BrowserWindow | null): void {
  const rootsFilePath = (): string => join(app.getPath("userData"), "roots.json");
  const send = (channel: string, payload: unknown): void => {
    getWindow()?.webContents.send(channel, payload);
  };

  ipcMain.handle(CH.terminalStart, (_event, request: unknown) => {
    const verdict = validateTerminalStart(request, readRootsFile(rootsFilePath()));
    if (!verdict.ok) return { ok: false, error: verdict.error };

    const shell = resolveShell(process.platform, process.env);
    const session = ptyManager.start(
      {
        label: shell.label,
        kind: "shell",
        command: [shell.file, ...shell.args].join(" "),
        file: shell.file,
        args: shell.args,
        cwd: verdict.cwd,
      },
      verdict.cols,
      verdict.rows,
    );
    return { ok: true, session };
  });

  ipcMain.handle(CH.terminalList, () =>
    ptyManager.list().filter((session) => session.kind === "shell"),
  );

  ipcMain.on(CH.terminalWrite, (_event, id: unknown, data: unknown) => {
    if (typeof id !== "string" || typeof data !== "string") return;
    if (data.length > 100_000) return; // a single keystroke batch is never this big
    ptyManager.write(id, data);
  });

  ipcMain.on(CH.terminalResize, (_event, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id !== "string") return;
    ptyManager.resize(id, Number(cols), Number(rows));
  });

  ipcMain.handle(CH.terminalKill, (_event, id: unknown) => {
    if (typeof id !== "string") return false;
    ptyManager.kill(id);
    return true;
  });

  ipcMain.handle(CH.terminalBuffer, (_event, id: unknown) =>
    typeof id === "string" ? ptyManager.buffer(id) : "",
  );

  ipcMain.handle(CH.terminalClear, (_event, id: unknown) => {
    if (typeof id === "string") ptyManager.clearBuffer(id);
  });

  ptyManager.on("output", (payload) => send(CH.terminalOutput, payload));
  ptyManager.on("exit", (payload) => send(CH.terminalExit, payload));
}
