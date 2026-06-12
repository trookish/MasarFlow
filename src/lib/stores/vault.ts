"use client";
import { create } from "zustand";
import { getDb, type SyncFile } from "../db/schema";
import { DEFAULT_VAULT_SETTINGS, type VaultSettings, type VaultBackendKind } from "../vault/types";
import { detectCapabilities } from "../vault/capabilities";
import { pickVault, verifyPermission, getSavedHandleName, saveHandleToken, clearHandleToken } from "../vault/fs-access";
import { runPull as _runPull, runPush as _runPush, runSync as _runSync, type SyncResult, type SyncProgress } from "../vault/sync-engine";
import { getBackend, resetBackend, getCachedKind } from "../vault/backends/strategy";
import { getBackendCapabilities } from "../vault/backends/types";
import { importVaultZip } from "../vault/zip-export";
import { saveSettings, getSettings } from "../vault/sync-engine-backend";

interface VaultStoreState {
  capabilities: { fsa: boolean; webkit: boolean; opfs: boolean; webkitdirectory: boolean; browserName: string };
  settings: VaultSettings;
  vaultName: string | null;
  status: "idle" | "syncing" | "error";
  lastError: string | null;
  lastFullSync: number | null;
  progress: SyncProgress | null;
  lastResult: SyncResult | null;
  init: () => Promise<void>;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  forget: () => Promise<void>;
  repick: () => Promise<boolean>;
  updateSettings: (patch: Partial<VaultSettings>) => Promise<void>;
  runPull: () => Promise<SyncResult | null>;
  runPush: (opts?: { asZip?: boolean }) => Promise<SyncResult | null>;
  runSync: () => Promise<SyncResult | null>;
  importZip: (file: File) => Promise<number>;
  clearError: () => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useVault = create<VaultStoreState>((set, get) => ({
  capabilities: typeof window === "undefined"
    ? { fsa: false, webkit: false, opfs: false, webkitdirectory: false, browserName: "server" }
    : { fsa: false, webkit: false, opfs: false, webkitdirectory: false, browserName: "unknown" },
  settings: { ...DEFAULT_VAULT_SETTINGS },
  vaultName: null,
  status: "idle",
  lastError: null,
  lastFullSync: null,
  progress: null,
  lastResult: null,

  init: async () => {
    const caps = detectCapabilities();
    const s = await getSettings();
    const name = getSavedHandleName();
    const meta = await getDb().vaultMeta.get("lastFullSync");
    const last = typeof meta?.value === "number" ? meta.value : null;
    const autoBackend: VaultBackendKind = caps.fsa ? "native-fsa" : caps.opfs ? "opfs" : "legacy-fallback";
    const finalBackend = s.backend === "auto" || !s.backend ? autoBackend : s.backend;
    const finalCaps = getBackendCapabilities(finalBackend);
    set({
      capabilities: { fsa: caps.fsa, webkit: caps.webkit, opfs: caps.opfs, webkitdirectory: caps.webkitdirectory, browserName: caps.browserName },
      settings: { ...s, backend: finalBackend, backendCapabilities: finalCaps },
      vaultName: name,
      lastFullSync: last,
    });
    if (s.pollingMs > 0 && finalBackend === "native-fsa") startPolling(get);
  },

  connect: async () => {
    try {
      const backend = await getBackend();
      const session = await backend.pick();
      if (!session) { set({ status: "idle" }); return false; }
      const caps = getBackendCapabilities(session.backend);
      const s = await saveSettings({ mode: session.backend === "native-fsa" ? "obsidian" : session.backend as VaultSettings["mode"], vaultName: session.rootName, backend: session.backend, backendCapabilities: caps });
      set({ vaultName: session.rootName, settings: s, status: "idle", lastError: null });
      const handle = await getNativeHandle();
      if (!handle) { set({ status: "error", lastError: "No vault handle" }); return false; }
      const r = await _runPull(handle, (await getDb().projects.toArray())[0]!, (p) => set({ progress: p }));
      set({ lastResult: r, lastFullSync: Date.now(), progress: null });
      await getDb().vaultMeta.put({ key: "lastFullSync", value: Date.now() });
      if (s.pollingMs > 0 && session.backend === "native-fsa") startPolling(get);
      return true;
    } catch (e) {
      set({ lastError: (e as Error).message, status: "error" });
      return false;
    }
  },

  disconnect: async () => {
    const s = await saveSettings({ mode: "disconnected", vaultName: null });
    clearHandleToken();
    resetBackend();
    set({ settings: s, vaultName: null, status: "idle" });
  },

  forget: async () => {
    const { setActiveHandle } = await import("../vault/handle-store");
    await setActiveHandle(null);
    clearHandleToken();
    const s = await saveSettings({ mode: "local", vaultName: null, backend: "auto", backendCapabilities: null });
    resetBackend();
    set({ settings: s, vaultName: null });
  },

  repick: async () => {
    resetBackend();
    return await get().connect();
  },

  updateSettings: async (patch) => {
    const s = await saveSettings(patch);
    set({ settings: s });
    if ("pollingMs" in patch) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (s.pollingMs > 0 && (s.backend === "native-fsa" || !s.backend)) startPolling(get);
    }
  },

  runPull: async () => {
    const kind = getCachedKind();
    if (kind === "native-fsa" || !kind) {
      const handle = await getNativeHandle();
      if (!handle) { set({ lastError: "Vault not connected" }); return null; }
      const project = (await getDb().projects.toArray())[0];
      if (!project) { set({ lastError: "No active project" }); return null; }
      set({ status: "syncing", lastError: null });
      try {
        const r = await _runPull(handle, project, (p) => set({ progress: p }));
        set({ status: "idle", lastResult: r, lastFullSync: Date.now(), progress: null });
        return r;
      } catch (e) {
        set({ status: "error", lastError: (e as Error).message });
        return null;
      }
    }
    const backend = await getBackend();
    const project = (await getDb().projects.toArray())[0];
    if (!project) { set({ lastError: "No active project" }); return null; }
    set({ status: "syncing" });
    try {
      const { runPullWithBackend } = await import("../vault/sync-engine-backend");
      const r = await runPullWithBackend(backend, project, (p) => set({ progress: p as unknown as SyncProgress }));
      set({ status: "idle", lastResult: r as unknown as SyncResult, lastFullSync: Date.now(), progress: null });
      return r as unknown as SyncResult;
    } catch (e) {
      set({ status: "error", lastError: (e as Error).message });
      return null;
    }
  },

  runPush: async (opts) => {
    const kind = getCachedKind();
    if (kind === "native-fsa" || !kind) {
      const handle = await getNativeHandle();
      if (!handle) return null;
      const project = (await getDb().projects.toArray())[0];
      if (!project) return null;
      set({ status: "syncing" });
      try {
        const r = await _runPush(handle, project, true);
        set({ status: "idle", lastResult: r });
        return r;
      } catch (e) {
        set({ status: "error", lastError: (e as Error).message });
        return null;
      }
    }
    const backend = await getBackend();
    const project = (await getDb().projects.toArray())[0];
    if (!project) return null;
    set({ status: "syncing" });
    try {
      const { runPushWithBackend } = await import("../vault/sync-engine-backend");
      const r = await runPushWithBackend(backend, project, { asZip: opts?.asZip });
      set({ status: "idle", lastResult: r as unknown as SyncResult });
      return r as unknown as SyncResult;
    } catch (e) {
      set({ status: "error", lastError: (e as Error).message });
      return null;
    }
  },

  runSync: async () => {
    const kind = getCachedKind();
    if (kind === "native-fsa" || !kind) {
      const handle = await getNativeHandle();
      if (!handle) return null;
      const project = (await getDb().projects.toArray())[0];
      if (!project) return null;
      set({ status: "syncing" });
      try {
        const r = await _runSync(handle, project, (p) => set({ progress: p }));
        set({ status: "idle", lastResult: r, lastFullSync: Date.now(), progress: null });
        await getDb().vaultMeta.put({ key: "lastFullSync", value: Date.now() });
        return r;
      } catch (e) {
        set({ status: "error", lastError: (e as Error).message });
        return null;
      }
    }
    const backend = await getBackend();
    const project = (await getDb().projects.toArray())[0];
    if (!project) return null;
    set({ status: "syncing" });
    try {
      const { runSyncWithBackend } = await import("../vault/sync-engine-backend");
      const r = await runSyncWithBackend(backend, project, (p) => set({ progress: p as unknown as SyncProgress }));
      set({ status: "idle", lastResult: r as unknown as SyncResult, lastFullSync: Date.now(), progress: null });
      await getDb().vaultMeta.put({ key: "lastFullSync", value: Date.now() });
      return r as unknown as SyncResult;
    } catch (e) {
      set({ status: "error", lastError: (e as Error).message });
      return null;
    }
  },

  importZip: async (file) => {
    set({ status: "syncing" });
    try {
      const entries = await importVaultZip(file);
      const backend = await getBackend();
      let count = 0;
      for (const e of entries) {
        const r = await backend.write(e.path, e.content);
        if (r.ok) count++;
      }
      set({ status: "idle" });
      return count;
    } catch (e) {
      set({ status: "error", lastError: (e as Error).message });
      return 0;
    }
  },

  clearError: () => set({ lastError: null }),
}));

async function getNativeHandle(): Promise<FileSystemDirectoryHandle | null> {
  const { getActiveHandle } = await import("../vault/handle-store");
  return await getActiveHandle();
}

function startPolling(get: () => VaultStoreState) {
  if (pollTimer) clearInterval(pollTimer);
  const ms = get().settings.pollingMs;
  if (ms <= 0) return;
  pollTimer = setInterval(() => {
    if (get().status === "idle") {
      void get().runSync();
    }
  }, ms);
}
