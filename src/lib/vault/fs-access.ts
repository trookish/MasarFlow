import type { VaultFileMeta } from "./types";
import { isIgnoredName, shouldSkipByExtension, detectFileKind, isInTrash, isTemplate, isNumberedFolder } from "./ignore-patterns";

const HANDLE_TOKEN_KEY = "masarflow.vault.handle";
const HANDLE_NAME_KEY = "masarflow.vault.name";

export type VaultDirectoryHandle = FileSystemDirectoryHandle & { name: string };

export async function pickVault(): Promise<VaultDirectoryHandle | null> {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> };
  if (!w.showDirectoryPicker) return null;
  try {
    const handle = await w.showDirectoryPicker({ mode: "readwrite" });
    return handle as VaultDirectoryHandle;
  } catch (e) {
    if ((e as Error).name === "AbortError") return null;
    throw e;
  }
}

export async function verifyPermission(handle: FileSystemDirectoryHandle, write = true): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const h = handle as unknown as { queryPermission?: (o: { mode: string }) => Promise<PermissionState>; requestPermission?: (o: { mode: string }) => Promise<PermissionState> };
  const query = h.queryPermission;
  const request = h.requestPermission;
  if (!query || !request) return false;
  const opts = { mode: write ? "readwrite" : "read" } as const;
  try {
    let res = await query(opts);
    if (res === "granted") return true;
    res = await request(opts);
    return res === "granted";
  } catch {
    return false;
  }
}

export async function readVaultFile(handle: FileSystemDirectoryHandle, path: string): Promise<File | null> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return null;
  let dir = handle;
  for (const seg of parts) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create: false });
    } catch {
      return null;
    }
  }
  try {
    const fh = await dir.getFileHandle(fileName, { create: false });
    return await fh.getFile();
  } catch {
    return null;
  }
}

export async function writeVaultFile(handle: FileSystemDirectoryHandle, path: string, content: string | Blob): Promise<boolean> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) return false;
  let dir = handle;
  for (const seg of parts) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    } catch {
      return false;
    }
  }
  try {
    const fh = await dir.getFileHandle(fileName, { create: true });
    const w = fh as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> };
    if (!w.createWritable) return false;
    const stream = await w.createWritable();
    const blob = typeof content === "string" ? new Blob([content], { type: "text/markdown" }) : content;
    await stream.write(blob);
    await stream.close();
    return true;
  } catch {
    return false;
  }
}

export async function walkVault(handle: FileSystemDirectoryHandle, opts: { includePatterns: string[]; excludePatterns: string[]; archiveIncluded: boolean; trashIncluded: boolean; maxDepth?: number; }): Promise<VaultFileMeta[]> {
  const out: VaultFileMeta[] = [];
  const maxDepth = opts.maxDepth ?? 8;

  const topFolders: string[] = [];
  const handleAny = handle as unknown as { entries?: () => AsyncIterable<[string, FileSystemHandle]>; kind?: string };
  if (!handleAny.entries) return out;
  for await (const [name] of handleAny.entries()) {
    if (isIgnoredName(name)) continue;
    if (name === ".trash") continue;
    if (name === "09. Archive" && !opts.archiveIncluded) continue;
    topFolders.push(name);
  }

  async function walk(dir: FileSystemDirectoryHandle, rel: string, depth: number) {
    if (depth > maxDepth) return;
    const dirAny = dir as unknown as { entries?: () => AsyncIterable<[string, FileSystemHandle]> };
    if (!dirAny.entries) return;
    for await (const [name, child] of dirAny.entries()) {
      if (isIgnoredName(name)) continue;
      if (shouldSkipByExtension(name)) continue;
      const childPath = rel ? rel + "/" + name : name;
      if (child.kind === "directory") {
        await walk(child as FileSystemDirectoryHandle, childPath, depth + 1);
      } else {
        let mtime = 0;
        let size = 0;
        try {
          const fh = child as unknown as { getFile?: () => Promise<File> };
          if (fh.getFile) {
            const f = await fh.getFile();
            mtime = f.lastModified;
            size = f.size;
          }
        } catch {}
        out.push({
          relativePath: childPath,
          size,
          mtime,
          kind: detectFileKind(name),
          inTrash: isInTrash(childPath),
          isTemplate: isTemplate(childPath),
        });
      }
    }
  }

  for (const top of topFolders) {
    const isNumbered = isNumberedFolder(top);
    const is06 = /^06\.\s*Templates/i.test(top);
    if (!isNumbered && !is06) continue;
    try {
      const sub = await handle.getDirectoryHandle(top, { create: false });
      await walk(sub, top, 1);
    } catch {}
  }

  if (opts.trashIncluded) {
    try {
      const trash = await handle.getDirectoryHandle(".trash", { create: false });
      await walk(trash, ".trash", 1);
    } catch {}
  }

  return out;
}

export function saveHandleToken(token: string, name: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HANDLE_TOKEN_KEY, token);
    window.localStorage.setItem(HANDLE_NAME_KEY, name);
  } catch {}
}

export function clearHandleToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HANDLE_TOKEN_KEY);
    window.localStorage.removeItem(HANDLE_NAME_KEY);
  } catch {}
}

export function getSavedHandleName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(HANDLE_NAME_KEY);
}
