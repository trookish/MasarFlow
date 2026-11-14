"use client";
import type { VaultBackend } from "./types";
import type { VaultBackendCapabilities, VaultSession, VaultWriteResult } from "../types";
import type { VaultFileMeta } from "../types";
import {
  pickVault as fsPickVault,
  verifyPermission as fsVerifyPermission,
  readVaultFile as fsReadVaultFile,
  writeVaultFile as fsWriteVaultFile,
  walkVault as fsWalkVault,
  saveHandleToken,
} from "../fs-access";
import { getActiveHandle, setActiveHandle } from "../handle-store";
import { saveSettings } from "../sync-engine-backend";

export { getActiveHandle, setActiveHandle };

const CAPS: VaultBackendCapabilities = {
  liveWatching: true,
  inPlaceWrites: true,
  multiSessionPersistence: true,
};

class NativeFsaBackend implements VaultBackend {
  readonly kind = "native-fsa" as const;
  readonly capabilities = CAPS;
  rootName = "";

  async pick(): Promise<VaultSession | null> {
    const handle = await fsPickVault();
    if (!handle) return null;
    const ok = await fsVerifyPermission(handle, true);
    if (!ok) return null;
    await setActiveHandle(handle);
    saveHandleToken(handle.name, handle.name);
    await saveSettings({
      mode: "obsidian",
      vaultName: handle.name,
      backend: "native-fsa",
      backendCapabilities: CAPS,
    });
    this.rootName = handle.name;
    const metas = await fsWalkVault(handle, {
      includePatterns: [],
      excludePatterns: [".obsidian", ".makemd", ".qodo", ".space", ".git", ".trash"],
      archiveIncluded: false,
      trashIncluded: true,
    });
    return { rootName: handle.name, backend: "native-fsa", fileCount: metas.length };
  }

  async read(relativePath: string): Promise<string | null> {
    const handle = await getActiveHandle();
    if (!handle) return null;
    const f = await fsReadVaultFile(handle, relativePath);
    if (!f) return null;
    return await f.text();
  }

  async write(relativePath: string, body: string): Promise<VaultWriteResult> {
    const handle = await getActiveHandle();
    if (!handle) return { ok: false, method: "in-place" };
    const ok = await fsWriteVaultFile(handle, relativePath, body);
    return { ok, method: "in-place" };
  }

  async walk(): Promise<VaultFileMeta[]> {
    const handle = await getActiveHandle();
    if (!handle) return [];
    return await fsWalkVault(handle, {
      includePatterns: [],
      excludePatterns: [".obsidian", ".makemd", ".qodo", ".space", ".git", ".trash"],
      archiveIncluded: false,
      trashIncluded: true,
    });
  }

  async reauthenticate(): Promise<boolean> {
    const handle = await getActiveHandle();
    if (!handle) return false;
    return await fsVerifyPermission(handle, true);
  }

  async reconnect(): Promise<VaultSession | null> {
    const handle = await getActiveHandle();
    if (!handle) return null;
    const ok = await fsVerifyPermission(handle, true);
    if (!ok) return null;
    this.rootName = handle.name;
    saveHandleToken(handle.name, handle.name);
    await saveSettings({
      mode: "obsidian",
      vaultName: handle.name,
      backend: "native-fsa",
      backendCapabilities: CAPS,
    });
    return { rootName: handle.name, backend: "native-fsa", fileCount: -1 };
  }

  async verifyStored(): Promise<"granted" | "prompt" | "missing"> {
    const handle = await getActiveHandle();
    if (!handle) return "missing";
    const h = handle as unknown as {
      queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
    };
    if (!h.queryPermission) return "missing";
    try {
      const state = await h.queryPermission({ mode: "readwrite" });
      return state === "granted" ? "granted" : "prompt";
    } catch {
      return "missing";
    }
  }
}

export function create(): VaultBackend {
  return new NativeFsaBackend();
}
