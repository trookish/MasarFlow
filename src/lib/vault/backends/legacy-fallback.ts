"use client";
import { getDb, type Attachment } from "../../db/schema";
import type { VaultBackend } from "./types";
import type { VaultBackendCapabilities, VaultSession, VaultWriteResult } from "../types";
import type { VaultFileMeta } from "../types";
import { saveHandleToken } from "../fs-access";
import { md5Hex } from "../markdown-adapter";

const CAPS: VaultBackendCapabilities = {
  liveWatching: false,
  inPlaceWrites: false,
  multiSessionPersistence: false,
};

class LegacyFallbackBackend implements VaultBackend {
  readonly kind = "legacy-fallback" as const;
  readonly capabilities = CAPS;
  rootName = "";

  async pick(): Promise<VaultSession | null> {
    const picked = await pickFolderViaWebkit();
    if (!picked) return null;
    this.rootName = picked.rootName;
    const { saveSettings } = await import("../sync-engine");
    await saveSettings({
      mode: "legacy-fallback",
      vaultName: picked.rootName,
      backend: "legacy-fallback",
      backendCapabilities: CAPS,
    });
    saveHandleToken(picked.rootName, picked.rootName);
    let count = 0;
    for (const f of picked.files) {
      const rel = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const isMd =
        f.name.toLowerCase().endsWith(".md") || f.name.toLowerCase().endsWith(".markdown");
      const id = await md5Hex("legacy:" + rel);
      const att: Attachment = {
        id,
        projectId: "",
        relativePath: rel,
        mimeType: f.type || (isMd ? "text/markdown" : "application/octet-stream"),
        size: f.size,
        blob: f,
        cachedAt: Date.now(),
        sourceVaultPath: null,
      };
      await getDb().attachments.put(att);
      count++;
    }
    await getDb().vaultMeta.put({
      key: "legacy.pick",
      value: { rootName: picked.rootName, count, at: Date.now() },
    });
    return { rootName: picked.rootName, backend: "legacy-fallback", fileCount: count };
  }

  async read(relativePath: string): Promise<string | null> {
    const id = await md5Hex("legacy:" + relativePath);
    const att = await getDb().attachments.get(id);
    if (!att?.blob) return null;
    return await att.blob.text();
  }

  async write(relativePath: string, body: string): Promise<VaultWriteResult> {
    const blob = new Blob([body], { type: "text/markdown" });
    const id = await md5Hex("legacy:" + relativePath);
    const att: Attachment = {
      id,
      projectId: "",
      relativePath,
      mimeType: "text/markdown",
      size: blob.size,
      blob,
      cachedAt: Date.now(),
      sourceVaultPath: null,
    };
    await getDb().attachments.put(att);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = relativePath.split("/").pop() || "note.md";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 100);
    return { ok: true, method: "download" };
  }

  async walk(): Promise<VaultFileMeta[]> {
    const all = await getDb().attachments.toArray();
    return all
      .filter(
        (a) =>
          (a.relativePath && a.relativePath.includes("/")) ||
          a.relativePath.endsWith(".md") ||
          a.relativePath.endsWith(".markdown"),
      )
      .map((a) => ({
        relativePath: a.relativePath,
        size: a.size,
        mtime: a.cachedAt,
        kind:
          a.relativePath.toLowerCase().endsWith(".md") ||
          a.relativePath.toLowerCase().endsWith(".markdown")
            ? ("markdown" as const)
            : ("other" as const),
        inTrash: a.relativePath.split("/").includes(".trash"),
        isTemplate:
          a.relativePath.startsWith("06. Templates") || a.relativePath.startsWith("06. Templates/"),
      }));
  }
}

async function pickFolderViaWebkit(): Promise<{ rootName: string; files: File[] } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    (input as unknown as { webkitdirectory: boolean }).webkitdirectory = true;
    input.multiple = true;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        document.body.removeChild(input);
        resolve(null);
        return;
      }
      const first = files[0];
      const rel =
        (first as unknown as { webkitRelativePath?: string }).webkitRelativePath || first.name;
      const rootName = rel.split("/")[0] || "Vault";
      document.body.removeChild(input);
      resolve({ rootName, files });
    });
    input.addEventListener("cancel", () => {
      if (input.parentNode) document.body.removeChild(input);
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function create(): VaultBackend {
  return new LegacyFallbackBackend();
}
