"use client";
import { getDb } from "../../db/schema";
import type { VaultBackend } from "./types";
import type { VaultBackendCapabilities, VaultSession, VaultWriteResult } from "../types";
import type { VaultFileMeta } from "../types";
import { saveHandleToken, getSavedHandleName } from "../fs-access";

const ROOT_DIR = "vault";
const META_KEY = "masarflow.opfs.root";

const CAPS: VaultBackendCapabilities = {
  liveWatching: false,
  inPlaceWrites: true,
  multiSessionPersistence: true,
};

type FsDirHandle = {
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<FsDirHandle>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FsFileHandle>;
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
  values: () => AsyncIterable<FsFileHandle | FsDirHandle>;
  name: string;
  kind: "directory";
};

type FsFileHandle = {
  createWritable: (options?: { keepExistingData?: boolean }) => Promise<FsWritable>;
  getFile: () => Promise<File>;
  name: string;
  kind: "file";
};

type FsWritable = {
  write: (data: string | BufferSource | Blob) => Promise<void>;
  close: () => Promise<void>;
};

class OpfsBackend implements VaultBackend {
  readonly kind = "opfs" as const;
  readonly capabilities = CAPS;
  rootName = "";
  private dirHandle: FsDirHandle | null = null;

  private async getOpfsRoot(): Promise<FsDirHandle> {
    if (this.dirHandle) return this.dirHandle;
    const nav = navigator as unknown as { storage: { getDirectory: () => Promise<FsDirHandle> } };
    const opfsRoot = await nav.storage.getDirectory();
    this.dirHandle = (await opfsRoot.getDirectoryHandle(ROOT_DIR, { create: true })) as unknown as FsDirHandle;
    return this.dirHandle;
  }

  async pick(): Promise<VaultSession | null> {
    const picked = await pickFolderViaWebkit();
    if (!picked) return null;
    const root = await this.getOpfsRoot();
    await clearDir(root);
    let count = 0;
    for (const f of picked.files) {
      const rel = relativeFromFile(f);
      if (!rel) continue;
      const parts = rel.split("/").slice(0, -1);
      let dir = root;
      for (const p of parts) {
        dir = (await dir.getDirectoryHandle(p, { create: true })) as unknown as FsDirHandle;
      }
      const fh = (await dir.getFileHandle(f.name, { create: true })) as unknown as FsFileHandle;
      const w = await fh.createWritable();
      await w.write(f);
      await w.close();
      count++;
    }
    this.rootName = picked.rootName;
    const { saveSettings } = await import("../sync-engine");
    await saveSettings({ mode: "opfs", vaultName: picked.rootName, backend: "opfs", backendCapabilities: CAPS });
    saveHandleToken(picked.rootName, picked.rootName);
    await getDb().vaultMeta.put({ key: META_KEY, value: { rootName: picked.rootName, count, at: Date.now() } });
    return { rootName: picked.rootName, backend: "opfs", fileCount: count };
  }

  async read(relativePath: string): Promise<string | null> {
    const root = await this.getOpfsRoot();
    const fh = await resolveFile(root, relativePath);
    if (!fh) return null;
    const f = await fh.getFile();
    return await f.text();
  }

  async write(relativePath: string, body: string): Promise<VaultWriteResult> {
    const root = await this.getOpfsRoot();
    const parts = relativePath.split("/").slice(0, -1);
    let dir = root;
    for (const p of parts) {
      dir = (await dir.getDirectoryHandle(p, { create: true })) as unknown as FsDirHandle;
    }
    const name = relativePath.split("/").pop()!;
    const fh = (await dir.getFileHandle(name, { create: true })) as unknown as FsFileHandle;
    const w = await fh.createWritable();
    await w.write(body);
    await w.close();
    return { ok: true, method: "in-place" };
  }

  async walk(): Promise<VaultFileMeta[]> {
    const root = await this.getOpfsRoot();
    const out: VaultFileMeta[] = [];
    await walkDir(root, "", out);
    return out;
  }

  async close(): Promise<void> {
    this.dirHandle = null;
  }
}

async function clearDir(dir: FsDirHandle) {
  const names: string[] = [];
  for await (const child of dir.values()) names.push(child.name);
  for (const n of names) await dir.removeEntry(n, { recursive: true });
}

async function walkDir(dir: FsDirHandle, rel: string, out: VaultFileMeta[]) {
  for await (const child of dir.values()) {
    const childPath = rel ? rel + "/" + child.name : child.name;
    if (child.kind === "directory") {
      await walkDir(child as FsDirHandle, childPath, out);
    } else {
      const f = await (child as FsFileHandle).getFile();
      out.push({
        relativePath: childPath,
        size: f.size,
        mtime: f.lastModified,
        kind: child.name.toLowerCase().endsWith(".md") || child.name.toLowerCase().endsWith(".markdown")
          ? "markdown"
          : "other",
        inTrash: false,
        isTemplate: childPath.startsWith("06. Templates") || childPath.startsWith("06. Templates/"),
      });
    }
  }
}

async function resolveFile(dir: FsDirHandle, relPath: string): Promise<FsFileHandle | null> {
  const parts = relPath.split("/");
  const fileName = parts.pop();
  if (!fileName) return null;
  let cur = dir;
  for (const p of parts) {
    try {
      cur = (await cur.getDirectoryHandle(p, { create: false })) as unknown as FsDirHandle;
    } catch {
      return null;
    }
  }
  try {
    return (await cur.getFileHandle(fileName, { create: false })) as unknown as FsFileHandle;
  } catch {
    return null;
  }
}

function relativeFromFile(f: File): string {
  const p = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  if (p) return p;
  return f.name;
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
      const rel = (first as unknown as { webkitRelativePath?: string }).webkitRelativePath || first.name;
      const rootName = rel.split("/")[0] || getSavedHandleName() || "Vault";
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
  return new OpfsBackend();
}
