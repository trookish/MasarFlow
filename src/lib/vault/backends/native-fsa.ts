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
} from "../fs-access";
import { getActiveHandle } from "../sync-engine";

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
    const { setActiveHandle, saveSettings } = await import("../sync-engine");
    await setActiveHandle(handle);
    const { saveHandleToken } = await import("../fs-access");
    saveHandleToken(handle.name, handle.name);
    const s = await saveSettings({ mode: "obsidian", vaultName: handle.name, backend: "native-fsa", backendCapabilities: CAPS });
    this.rootName = handle.name;
    void s;
    const metas = await fsWalkVault(handle, { includePatterns: [], excludePatterns: [".obsidian", ".makemd", ".qodo", ".space", ".git", ".trash"], archiveIncluded: false, trashIncluded: true });
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
    return await fsWalkVault(handle, { includePatterns: [], excludePatterns: [".obsidian", ".makemd", ".qodo", ".space", ".git", ".trash"], archiveIncluded: false, trashIncluded: true });
  }

  async reauthenticate(): Promise<boolean> {
    const handle = await getActiveHandle();
    if (!handle) return false;
    return await fsVerifyPermission(handle, true);
  }
}

export function create(): VaultBackend {
  return new NativeFsaBackend();
}
