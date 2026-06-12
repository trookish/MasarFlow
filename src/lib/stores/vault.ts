import { create } from "zustand";
import { getDb, type SyncFile } from "../db/schema";
import { DEFAULT_VAULT_SETTINGS, type VaultSettings } from "../vault/types";
import { detectCapabilities } from "../vault/capabilities";
import { pickVault, verifyPermission, getSavedHandleName, saveHandleToken, clearHandleToken } from "../vault/fs-access";
import { getSettings, saveSettings, getActiveHandle, setActiveHandle, runPull as _runPull, runPush as _runPush, runSync as _runSync, type SyncResult, type SyncProgress } from "../vault/sync-engine";

interface VaultStoreState {
  capabilities: { fsa: boolean; webkit: boolean; browserName: string };
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
  updateSettings: (patch: Partial<VaultSettings>) => Promise<void>;
  runPull: () => Promise<SyncResult | null>;
  runPush: () => Promise<SyncResult | null>;
  runSync: () => Promise<SyncResult | null>;
  clearError: () => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useVault = create<VaultStoreState>((set, get) => ({
  capabilities: typeof window === "undefined" ? { fsa: false, webkit: false, browserName: "server" } : { fsa: false, webkit: false, browserName: "unknown" },
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
    set({ capabilities: caps, settings: s, vaultName: name, lastFullSync: last });
    if (s.pollingMs > 0) startPolling(get);
  },

  connect: async () => {
    try {
      const handle = await pickVault();
      if (!handle) { set({ status: "idle" }); return false; }
      const ok = await verifyPermission(handle, true);
      if (!ok) { set({ lastError: "Permission denied. Re-pick the vault and grant read/write." }); return false; }
      await setActiveHandle(handle);
      saveHandleToken(handle.name, handle.name);
      const s = await saveSettings({ mode: "obsidian", vaultName: handle.name });
      set({ vaultName: handle.name, settings: s, status: "idle", lastError: null });
      const r = await _runPull(handle, (await getDb().projects.toArray())[0]!, (p) => set({ progress: p }));
      set({ lastResult: r, lastFullSync: Date.now(), progress: null });
      await getDb().vaultMeta.put({ key: "lastFullSync", value: Date.now() });
      return true;
    } catch (e) {
      set({ lastError: (e as Error).message, status: "error" });
      return false;
    }
  },

  disconnect: async () => {
    const s = await saveSettings({ mode: "disconnected", vaultName: null });
    clearHandleToken();
    set({ settings: s, vaultName: null, status: "idle" });
  },

  forget: async () => {
    await setActiveHandle(null);
    clearHandleToken();
    const s = await saveSettings({ mode: "local", vaultName: null });
    set({ settings: s, vaultName: null });
  },

  updateSettings: async (patch) => {
    const s = await saveSettings(patch);
    set({ settings: s });
    if ("pollingMs" in patch) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (s.pollingMs > 0) startPolling(get);
    }
  },

  runPull: async () => {
    const handle = await getActiveHandle();
    if (!handle) { set({ lastError: "Vault not connected" }); return null; }
    const projects = await getDb().projects.toArray();
    const project = projects[0];
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
  },

  runPush: async () => {
    const handle = await getActiveHandle();
    if (!handle) return null;
    const projects = await getDb().projects.toArray();
    const project = projects[0];
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
  },

  runSync: async () => {
    const handle = await getActiveHandle();
    if (!handle) return null;
    const projects = await getDb().projects.toArray();
    const project = projects[0];
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
  },

  clearError: () => set({ lastError: null }),
}));

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
