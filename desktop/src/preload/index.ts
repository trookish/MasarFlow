import { contextBridge, ipcRenderer } from "electron";
import { CH } from "@shared/channels";
import type { MasarflowApi } from "@shared/api";

const api: MasarflowApi = {
  platform: process.platform,
  app: {
    info: () => ipcRenderer.invoke(CH.appInfo),
    openLogs: () => ipcRenderer.invoke(CH.appOpenLogs),
    relaunch: () => ipcRenderer.send(CH.appRelaunch),
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
};

contextBridge.exposeInMainWorld("masarflow", api);
