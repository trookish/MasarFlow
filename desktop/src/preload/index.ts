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
};

contextBridge.exposeInMainWorld("masarflow", api);
