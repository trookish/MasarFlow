import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AppSettings,
  DirectoryPickResult,
  EnvData,
  EnvField,
  GithubCloneResult,
  SaveEnvResult,
  ServerStatus,
  SessionExitPayload,
  SessionInfo,
  SessionOutputPayload,
  SetupState,
  StartSessionRequest,
} from "@shared/types";

type Unsubscribe = () => void;

const api = {
  session: {
    start: (req: StartSessionRequest): Promise<SessionInfo> => ipcRenderer.invoke("session:start", req),
    list: (): Promise<SessionInfo[]> => ipcRenderer.invoke("session:list"),
    buffer: (id: string): Promise<string> => ipcRenderer.invoke("session:buffer", id),
    clearBuffer: (id: string): void => ipcRenderer.send("session:clear-buffer", id),
    input: (id: string, data: string): void => ipcRenderer.send("session:input", { id, data }),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send("session:resize", { id, cols, rows }),
    kill: (id: string): void => ipcRenderer.send("session:kill", id),
    onOutput: (cb: (p: SessionOutputPayload) => void): Unsubscribe => {
      const listener = (_e: IpcRendererEvent, p: SessionOutputPayload): void => cb(p);
      ipcRenderer.on("session:output", listener);
      return () => ipcRenderer.removeListener("session:output", listener);
    },
    onExit: (cb: (p: SessionExitPayload) => void): Unsubscribe => {
      const listener = (_e: IpcRendererEvent, p: SessionExitPayload): void => cb(p);
      ipcRenderer.on("session:exit", listener);
      return () => ipcRenderer.removeListener("session:exit", listener);
    },
    onChanged: (cb: (info: SessionInfo) => void): Unsubscribe => {
      const listener = (_e: IpcRendererEvent, i: SessionInfo): void => cb(i);
      ipcRenderer.on("session:changed", listener);
      return () => ipcRenderer.removeListener("session:changed", listener);
    },
    onList: (cb: (sessions: SessionInfo[]) => void): Unsubscribe => {
      const listener = (_e: IpcRendererEvent, s: SessionInfo[]): void => cb(s);
      ipcRenderer.on("session:list", listener);
      return () => ipcRenderer.removeListener("session:list", listener);
    },
  },
  run: {
    startDev: (autoOpen: boolean): Promise<SessionInfo> =>
      ipcRenderer.invoke("run:start-dev", { autoOpen }),
    startProd: (autoOpen: boolean): Promise<SessionInfo> =>
      ipcRenderer.invoke("run:start-prod", { autoOpen }),
    build: (): Promise<SessionInfo> => ipcRenderer.invoke("run:build"),
    stop: (): Promise<void> => ipcRenderer.invoke("run:stop"),
  },
  setup: {
    check: (): Promise<SetupState> => ipcRenderer.invoke("setup:check"),
    run: (): Promise<SetupState> => ipcRenderer.invoke("setup:run"),
    onState: (cb: (state: SetupState) => void): Unsubscribe => {
      const listener = (_e: IpcRendererEvent, s: SetupState): void => cb(s);
      ipcRenderer.on("setup:state", listener);
      return () => ipcRenderer.removeListener("setup:state", listener);
    },
  },
  env: {
    read: (): Promise<EnvData> => ipcRenderer.invoke("env:read"),
    save: (fields: EnvField[]): Promise<SaveEnvResult> => ipcRenderer.invoke("env:save", fields),
    saveRaw: (content: string): Promise<SaveEnvResult> => ipcRenderer.invoke("env:save-raw", content),
  },
  platform: process.platform,
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke("settings:set", patch),
    markLaunched: (): Promise<void> => ipcRenderer.invoke("settings:mark-launched"),
  },
  assets: {
    getBanner: (): Promise<string | null> => ipcRenderer.invoke("assets:banner"),
  },
  server: {
    getStatus: (): Promise<ServerStatus> => ipcRenderer.invoke("server:get-status"),
    onStatus: (cb: (status: ServerStatus) => void): Unsubscribe => {
      const listener = (_e: IpcRendererEvent, s: ServerStatus): void => cb(s);
      ipcRenderer.on("server:status", listener);
      return () => ipcRenderer.removeListener("server:status", listener);
    },
  },
  window: {
    minimize: (): void => ipcRenderer.send("window:minimize"),
    toggleMaximize: (): void => ipcRenderer.send("window:toggle-maximize"),
    close: (): void => ipcRenderer.send("window:close"),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:is-maximized"),
    onMaximized: (cb: (maximized: boolean) => void): Unsubscribe => {
      const listener = (_e: IpcRendererEvent, m: boolean): void => cb(m);
      ipcRenderer.on("window:maximized", listener);
      return () => ipcRenderer.removeListener("window:maximized", listener);
    },
  },
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:open-external", url),
    chooseDirectory: (): Promise<DirectoryPickResult | null> =>
      ipcRenderer.invoke("dialog:choose-directory"),
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke("dialog:choose-folder"),
  },
  github: {
    repoUrl: (): Promise<string> => ipcRenderer.invoke("github:repo-url"),
    clone: (parent: string): Promise<GithubCloneResult> => ipcRenderer.invoke("github:clone", parent),
  },
  clipboard: {
    writeText: (text: string): Promise<void> => ipcRenderer.invoke("clipboard:write-text", text),
    readText: (): Promise<string> => ipcRenderer.invoke("clipboard:read-text"),
  },
  ui: {
    onNavigate: (cb: (page: string) => void): Unsubscribe => {
      const listener = (_e: IpcRendererEvent, page: string): void => cb(page);
      ipcRenderer.on("ui:navigate", listener);
      return () => ipcRenderer.removeListener("ui:navigate", listener);
    },
  },
};

export type MasarFlowApi = typeof api;

contextBridge.exposeInMainWorld("masarFlow", api);
