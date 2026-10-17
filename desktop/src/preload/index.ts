import { contextBridge, ipcRenderer } from "electron";
import { CH } from "@shared/channels";
import type { MasarflowApi } from "@shared/api";

const api: MasarflowApi = {
  platform: process.platform,
  app: {
    info: () => ipcRenderer.invoke(CH.appInfo),
    env: () => ipcRenderer.invoke(CH.appEnv),
    openLogs: () => ipcRenderer.invoke(CH.appOpenLogs),
    relaunch: () => ipcRenderer.send(CH.appRelaunch),
    onNavigate: (cb) => {
      const listener = (_e: unknown, route: string): void => cb(route);
      ipcRenderer.on(CH.appNavigate, listener);
      return () => ipcRenderer.removeListener(CH.appNavigate, listener);
    },
  },
  dialog: { chooseFolder: (d) => ipcRenderer.invoke(CH.dialogChooseFolder, d) },
  roots: {
    list: () => ipcRenderer.invoke(CH.rootsList),
    covers: (p) => ipcRenderer.invoke(CH.rootsCovers, p),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(CH.shellOpenExternal, url),
    showItemInFolder: (p) => ipcRenderer.send(CH.shellShowItem, p),
  },
  clipboard: {
    writeText: (t) => ipcRenderer.invoke(CH.clipboardWrite, t),
    readText: () => ipcRenderer.invoke(CH.clipboardRead),
  },
  window: {
    minimize: () => ipcRenderer.send(CH.winMinimize),
    toggleMaximize: () => ipcRenderer.send(CH.winToggleMax),
    close: () => ipcRenderer.send(CH.winClose),
    isMaximized: () => ipcRenderer.invoke(CH.winIsMax),
    onMaximized: (cb) => {
      const listener = (_e: unknown, v: boolean): void => cb(v);
      ipcRenderer.on(CH.winMaximized, listener);
      return () => ipcRenderer.removeListener(CH.winMaximized, listener);
    },
  },
  secrets: {
    available: () => ipcRenderer.invoke(CH.secretsAvailable),
    get: (key) => ipcRenderer.invoke(CH.secretsGet, key),
    set: (key, value) => ipcRenderer.invoke(CH.secretsSet, key, value),
    delete: (key) => ipcRenderer.invoke(CH.secretsDelete, key),
    has: (key) => ipcRenderer.invoke(CH.secretsHas, key),
  },
  diagnostics: {
    collect: (input) => ipcRenderer.invoke(CH.diagnosticsCollect, input),
  },
  changelog: {
    read: () => ipcRenderer.invoke(CH.changelogRead),
  },
  backups: {
    write: (json) => ipcRenderer.invoke(CH.backupsWrite, json),
    list: () => ipcRenderer.invoke(CH.backupsList),
    read: (name) => ipcRenderer.invoke(CH.backupsRead, name),
    openFolder: () => ipcRenderer.invoke(CH.backupsOpenFolder),
  },
  git: {
    available: () => ipcRenderer.invoke(CH.gitAvailable),
    status: (root) => ipcRenderer.invoke(CH.gitStatus, root),
    diff: (root, options) => ipcRenderer.invoke(CH.gitDiff, root, options),
    stage: (root, paths) => ipcRenderer.invoke(CH.gitStage, root, paths),
    unstage: (root, paths) => ipcRenderer.invoke(CH.gitUnstage, root, paths),
    commit: (root, options) => ipcRenderer.invoke(CH.gitCommit, root, options),
    log: (root, options) => ipcRenderer.invoke(CH.gitLog, root, options),
    branches: (root) => ipcRenderer.invoke(CH.gitBranches, root),
    switchBranch: (root, name) => ipcRenderer.invoke(CH.gitSwitchBranch, root, name),
    createBranch: (root, name, checkout) => ipcRenderer.invoke(CH.gitCreateBranch, root, name, checkout),
    init: (root) => ipcRenderer.invoke(CH.gitInit, root),
    remote: (root) => ipcRenderer.invoke(CH.gitRemote, root),
  },
  terminal: {
    start: (input) => ipcRenderer.invoke(CH.terminalStart, input),
    list: () => ipcRenderer.invoke(CH.terminalList),
    write: (id, data) => {
      ipcRenderer.send(CH.terminalWrite, id, data);
    },
    resize: (id, cols, rows) => {
      ipcRenderer.send(CH.terminalResize, id, cols, rows);
    },
    kill: (id) => ipcRenderer.invoke(CH.terminalKill, id),
    buffer: (id) => ipcRenderer.invoke(CH.terminalBuffer, id),
    clear: (id) => ipcRenderer.invoke(CH.terminalClear, id),
    onOutput: (cb) => {
      const listener = (_e: unknown, payload: { id: string; data: string }): void => cb(payload);
      ipcRenderer.on(CH.terminalOutput, listener);
      return () => ipcRenderer.removeListener(CH.terminalOutput, listener);
    },
    onExit: (cb) => {
      const listener = (_e: unknown, payload: { id: string; exitCode: number | null }): void => cb(payload);
      ipcRenderer.on(CH.terminalExit, listener);
      return () => ipcRenderer.removeListener(CH.terminalExit, listener);
    },
  },
  logs: {
    list: () => ipcRenderer.invoke(CH.logsList),
    tail: (name, lines) => ipcRenderer.invoke(CH.logsTail, name, lines),
    openFolder: () => ipcRenderer.invoke(CH.logsOpenFolder),
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    set: (patch) => ipcRenderer.invoke(CH.settingsSet, patch),
  },
};

contextBridge.exposeInMainWorld("masarflow", api);
